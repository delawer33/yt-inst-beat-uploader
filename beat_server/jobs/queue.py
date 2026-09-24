"""Enqueue, recover and retry jobs. Every state change here is published on the bus."""

from sqlalchemy.orm import Session, sessionmaker

from beat_server.db.models import Job, JobKind, JobStatus, utcnow
from beat_server.db.repo import JobRepo
from beat_server.jobs.events import EventBus
from beat_upload.errors import BeatUploadError

RETRYABLE = frozenset({JobStatus.FAILED, JobStatus.PAUSED})
SUPERSEDED_ERROR = "superseded by retry"
CANCELLED_ERROR = "cancelled: the beat was deleted"


class JobError(BeatUploadError):
    """A job operation the API can report to the user."""


class JobNotFound(JobError):
    pass


class JobNotRetryable(JobError):
    pass


class JobQueue:
    def __init__(self, session_factory: sessionmaker[Session], bus: EventBus) -> None:
        self._session_factory = session_factory
        self._bus = bus

    def enqueue(self, kind: JobKind, beat_id: str | None = None) -> Job:
        with self._session_factory() as session:
            job = JobRepo(session).add(Job(kind=kind, beat_id=beat_id))
        self._bus.publish_job(job)
        return job

    def cancel_for_beat(self, beat_id: str) -> list[Job]:
        """Stop the pending jobs of ``beat_id`` (the owner deleted the Draft under them).

        QUEUED and PAUSED jobs are marked FAILED so the worker skips them. A RUNNING one
        cannot be stopped; it finds the beat gone and fails itself with ``BeatNotFound``,
        which is why it is left alone here.
        """
        with self._session_factory() as session:
            repo = JobRepo(session)
            jobs = [j for j in repo.pending_for_beat(beat_id) if j.status != JobStatus.RUNNING]
            for job in jobs:
                job.status = JobStatus.FAILED
                job.error = CANCELLED_ERROR
                job.finished_at = utcnow()
                repo.save(job)
        for job in jobs:
            self._bus.publish_job(job)
        return jobs

    def recover(self) -> int:
        """At startup: jobs left RUNNING by a previous process go back to QUEUED."""
        return self._requeue(JobStatus.RUNNING)

    def resume_paused(self) -> int:
        """After the Google connection is restored: PAUSED jobs run again."""
        return self._requeue(JobStatus.PAUSED)

    def retry(self, job_id: str) -> Job:
        """Run ``job_id`` again: a new job for a FAILED/PAUSED one, "now" for a waiting one.

        FAILED or PAUSED: a new job of the same kind and beat is created and returned. A
        PAUSED original becomes FAILED ("superseded by retry") in the same transaction,
        otherwise ``resume_paused`` would run it again next to the retry.
        QUEUED with ``not_before`` (waiting out a network-retry delay): the same job is
        returned with the delay dropped, so the worker picks it up now.
        Anything else raises ``JobNotRetryable``.
        """
        with self._session_factory() as session:
            repo = JobRepo(session)
            job = repo.get(job_id)
            if job is None:
                raise JobNotFound(f"Job {job_id} does not exist.")
            if job.status == JobStatus.QUEUED and job.not_before is not None:
                job.not_before = None
                repo.save(job)
                self._bus.publish_job(job)
                return job
            if job.status not in RETRYABLE:
                raise JobNotRetryable(
                    f"Job {job_id} is {job.status}; only failed or paused jobs can be retried."
                )
            superseded = job.status == JobStatus.PAUSED
            if superseded:
                job.status = JobStatus.FAILED
                job.error = SUPERSEDED_ERROR
                session.add(job)
            new_job = repo.add(Job(kind=job.kind, beat_id=job.beat_id))
        if superseded:
            self._bus.publish_job(job)
        self._bus.publish_job(new_job)
        return new_job

    def _requeue(self, status: JobStatus) -> int:
        with self._session_factory() as session:
            repo = JobRepo(session)
            jobs = repo.with_status(status)
            for job in jobs:
                job.status = JobStatus.QUEUED
                job.started_at = None
                job.error = None
                repo.save(job)
        for job in jobs:
            self._bus.publish_job(job)
        return len(jobs)
