"""Runs queued jobs one at a time and maps handler failures onto job states.

Handlers are coroutines. CPU/IO-bound work inside them (ffmpeg, Google APIs) goes through
``asyncio.to_thread``; ``JobContext.progress``/``log`` may be called from those threads.
"""

import asyncio
import logging
import threading
from collections.abc import Awaitable, Callable, Mapping

from google.oauth2.credentials import Credentials
from sqlalchemy.orm import Session, sessionmaker

from beat_server.db.models import Job, JobKind, JobStatus, utcnow
from beat_server.db.repo import JobRepo
from beat_server.jobs.events import EventBus
from beat_server.jobs.queue import JobQueue
from beat_upload import auth
from beat_upload.errors import AuthError, BeatUploadError
from beat_upload.workspace import Workspace

log = logging.getLogger(__name__)

POLL_INTERVAL = 0.5


class JobContext:
    """What a handler gets: the job row, a session, the workspace and ways to report."""

    def __init__(
        self,
        job: Job,
        session: Session,
        workspace: Workspace,
        bus: EventBus,
        queue: JobQueue,
    ) -> None:
        self.job = job
        self.session = session
        self.workspace = workspace
        self.bus = bus
        self.queue = queue
        self._lock = threading.Lock()

    def progress(self, fraction: float, message: str = "") -> None:
        """Save ``fraction`` (0..1) and ``message`` on the job and publish it."""
        self._update(progress=max(0.0, min(1.0, fraction)), message=message)

    def log(self, line: str) -> None:
        """Log ``line`` and show it as the job's current message (progress unchanged)."""
        log.info("job %s (%s): %s", self.job.id, self.job.kind, line)
        self._update(message=line)

    def credentials(self) -> Credentials:
        """Raises ``AuthError``; the worker then pauses the job until reconnect."""
        return auth.get_valid_credentials(self.workspace)

    def enqueue(self, kind: JobKind, beat_id: str | None = None) -> Job:
        """Follow-up job (render → upload)."""
        return self.queue.enqueue(kind, beat_id)

    def _update(self, *, progress: float | None = None, message: str | None = None) -> None:
        with self._lock:
            if progress is not None:
                self.job.progress = progress
            if message is not None:
                self.job.message = message
            JobRepo(self.session).save(self.job)
            self.bus.publish_job(self.job)


JobHandler = Callable[[JobContext], Awaitable[None]]


class Worker:
    def __init__(
        self,
        queue: JobQueue,
        handlers: Mapping[JobKind, JobHandler],
        session_factory: sessionmaker[Session],
        workspace: Workspace,
        bus: EventBus,
        *,
        poll_interval: float = POLL_INTERVAL,
    ) -> None:
        self._queue = queue
        self._handlers = handlers
        self._session_factory = session_factory
        self._workspace = workspace
        self._bus = bus
        self._poll_interval = poll_interval

    async def run_forever(self) -> None:
        """Poll for queued jobs until cancelled. One job at a time."""
        while True:
            with self._session_factory() as session:
                job = JobRepo(session).next_queued()
            if job is None:
                await asyncio.sleep(self._poll_interval)
                continue
            await self.run_one(job)

    async def run_one(self, job: Job) -> None:
        session = self._session_factory()
        try:
            job = session.get(Job, job.id) or session.merge(job)
            job.status = JobStatus.RUNNING
            job.started_at = utcnow()
            job.error = None
            self._save(session, job)
            ctx = JobContext(job, session, self._workspace, self._bus, self._queue)
            try:
                handler = self._handlers.get(job.kind)
                if handler is None:
                    raise BeatUploadError(f"No handler for job kind {job.kind}.")
                await handler(ctx)
            except AuthError as e:
                job.status = JobStatus.PAUSED
                job.error = str(e)
            except BeatUploadError as e:
                job.status = JobStatus.FAILED
                job.error = str(e)
            except Exception as e:  # noqa: BLE001
                # Design (web-v1 §Slice 4): anything else → FAILED + logged traceback.
                # The worker must survive a buggy handler; the user sees a generic message.
                log.exception("job %s (%s) crashed", job.id, job.kind)
                job.status = JobStatus.FAILED
                job.error = f"Unexpected error: {type(e).__name__}"
            else:
                job.status = JobStatus.DONE
                job.progress = 1.0
            job.finished_at = utcnow()
            self._save(session, job)
        finally:
            session.close()

    def _save(self, session: Session, job: Job) -> None:
        JobRepo(session).save(job)
        self._bus.publish_job(job)
