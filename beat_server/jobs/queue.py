"""Enqueue, recover and retry jobs. Every state change here is published on the bus."""

from sqlalchemy.orm import Session, sessionmaker

from beat_server.db.models import Job, JobKind, JobStatus
from beat_server.db.repo import JobRepo
from beat_server.jobs.events import EventBus
from beat_upload.errors import BeatUploadError

RETRYABLE = frozenset({JobStatus.FAILED, JobStatus.PAUSED})
SUPERSEDED_ERROR = "superseded by retry"


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

    def recover(self) -> int:
        """At startup: jobs left RUNNING by a previous process go back to QUEUED."""
        return self._requeue(JobStatus.RUNNING)

    def resume_paused(self) -> int:
        """After the Google connection is restored: PAUSED jobs run again."""
        return self._requeue(JobStatus.PAUSED)

    def retry(self, job_id: str) -> Job:
        """New job of the same kind and beat. Only FAILED or PAUSED jobs can be retried.

        A PAUSED original becomes FAILED ("superseded by retry") in the same transaction,
        otherwise ``resume_paused`` would run it again next to the retry.
        """
        with self._session_factory() as session:
            repo = JobRepo(session)
            job = repo.get(job_id)
            if job is None:
                raise JobNotFound(f"Job {job_id} does not exist.")
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
