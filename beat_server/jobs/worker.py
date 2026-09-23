"""Runs queued jobs one at a time and maps handler failures onto job states.

Handlers are coroutines. CPU/IO-bound work inside them (ffmpeg, Google APIs) goes through
``asyncio.to_thread``; ``JobContext.progress``/``log`` may be called from those threads.
"""

import asyncio
import logging
import threading
from collections.abc import Awaitable, Callable, Mapping
from datetime import timedelta

from google.oauth2.credentials import Credentials
from sqlalchemy import update
from sqlalchemy.orm import Session, sessionmaker

from beat_server.db.models import Job, JobKind, JobStatus, utcnow
from beat_server.db.repo import JobRepo
from beat_server.jobs.events import EventBus
from beat_server.jobs.queue import JobQueue
from beat_upload import auth
from beat_upload.errors import AuthError, BeatUploadError, NetworkError
from beat_upload.workspace import Workspace

log = logging.getLogger(__name__)

POLL_INTERVAL = 0.5
MISSING_CONNECTION_ERROR = "Google connection is missing or expired. Reconnect in Settings."

# A ``NetworkError`` (laptop asleep, Wi-Fi not up yet, Google unreachable) does not fail the
# job: it goes back to QUEUED with a growing delay. 6 attempts = 2+4+8+16+32 min of waiting.
MAX_ATTEMPTS = 6
RETRY_BASE_DELAY = 120.0


def retry_delay(attempts: int) -> float:
    """Seconds to wait before the next try, ``attempts`` being the number already made."""
    return RETRY_BASE_DELAY * 2 ** (attempts - 1)


def has_retries_left(job: Job) -> bool:
    """Whether a network failure in the current attempt of ``job`` would be retried.

    Handlers use it before raising ``NetworkError`` to pick the state they leave behind
    (see ``services/pipeline.py``); the worker uses the same test to decide the outcome.
    """
    return job.attempts + 1 < MAX_ATTEMPTS


class JobContext:
    """What a handler gets: the job row, a session, the workspace and ways to report.

    ``session`` belongs to the loop thread (the handler's own reads/writes). ``progress`` and
    ``log`` may be called from ``to_thread`` workers: they write through a short session of
    their own and mirror the values onto ``job``, so the handler always sees what was saved.
    """

    def __init__(
        self,
        job: Job,
        session: Session,
        workspace: Workspace,
        bus: EventBus,
        queue: JobQueue,
        session_factory: sessionmaker[Session],
    ) -> None:
        self.job = job
        self.session = session
        self._session_factory = session_factory
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
        """Raises ``AuthError``; the worker then pauses the job until reconnect.

        The CLI's message ("run `beat-upload login`") is replaced with one that makes
        sense in the web UI, where the job's error is shown.
        """
        try:
            return auth.get_valid_credentials(self.workspace)
        except AuthError as exc:
            raise AuthError(MISSING_CONNECTION_ERROR) from exc

    def enqueue(self, kind: JobKind, beat_id: str | None = None) -> Job:
        """Follow-up job (render → upload)."""
        return self.queue.enqueue(kind, beat_id)

    def _update(self, *, progress: float | None = None, message: str | None = None) -> None:
        values: dict[str, float | str] = {}
        if progress is not None:
            values["progress"] = progress
        if message is not None:
            values["message"] = message
        with self._lock:
            with self._session_factory() as session:
                session.execute(update(Job).where(Job.id == self.job.id).values(**values))
                session.commit()
            for name, value in values.items():
                setattr(self.job, name, value)
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
            try:
                with self._session_factory() as session:
                    job = JobRepo(session).next_queued()
                if job is None:
                    await asyncio.sleep(self._poll_interval)
                    continue
                await self.run_one(job)
            except Exception:  # noqa: BLE001
                # Design (web-v1 §Slice 4): the worker loop outlives DB hiccups (locked
                # sqlite, disk full, ...). Log and try again after a pause; cancellation
                # is a BaseException and still stops the loop.
                log.exception("worker loop iteration failed; retrying")
                await asyncio.sleep(self._poll_interval)

    async def run_one(self, job: Job) -> None:
        """Run ``job`` if it is still QUEUED; a job that vanished or moved on is skipped."""
        session = self._session_factory()
        try:
            row = session.get(Job, job.id)
            if row is None or row.status != JobStatus.QUEUED:
                return
            job = row
            job.status = JobStatus.RUNNING
            job.started_at = utcnow()
            job.error = None
            self._save(session, job)
            ctx = JobContext(
                job, session, self._workspace, self._bus, self._queue, self._session_factory
            )
            try:
                handler = self._handlers.get(job.kind)
                if handler is None:
                    raise BeatUploadError(f"No handler for job kind {job.kind}.")
                await handler(ctx)
            except asyncio.CancelledError:
                # Server shutdown mid-job: back to QUEUED so the next start picks it up.
                job.status = JobStatus.QUEUED
                job.started_at = None
                self._save(session, job)
                raise
            except AuthError as e:
                job.status = JobStatus.PAUSED
                job.error = str(e)
            except NetworkError as e:
                retrying = has_retries_left(job)
                job.attempts += 1
                job.error = str(e)
                if retrying:
                    delay = retry_delay(job.attempts)
                    log.warning(
                        "job %s (%s) network error, retry %d/%d in %.0fs: %s",
                        job.id,
                        job.kind,
                        job.attempts,
                        MAX_ATTEMPTS - 1,
                        delay,
                        e,
                    )
                    job.status = JobStatus.QUEUED
                    job.started_at = None
                    job.progress = 0.0
                    job.message = ""
                    job.not_before = utcnow() + timedelta(seconds=delay)
                    self._save(session, job)
                    return
                job.status = JobStatus.FAILED
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
