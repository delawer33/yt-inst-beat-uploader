"""Jobs: list, inspect, retry."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from beat_server.api.schemas import JobOut
from beat_server.db.repo import JobRepo
from beat_server.deps import get_session
from beat_server.jobs.queue import JobNotFound, JobNotRetryable, JobQueue

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def get_queue(request: Request) -> JobQueue:
    return request.app.state.queue


SessionDep = Annotated[Session, Depends(get_session)]
QueueDep = Annotated[JobQueue, Depends(get_queue)]


@router.get("", response_model=list[JobOut])
def list_jobs(
    session: SessionDep,
    beat_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> list[JobOut]:
    repo = JobRepo(session)
    jobs = repo.for_beat(beat_id)[:limit] if beat_id else repo.list(limit)
    return [JobOut.model_validate(job) for job in jobs]


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: str, session: SessionDep) -> JobOut:
    job = JobRepo(session).get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} does not exist.")
    return JobOut.model_validate(job)


@router.post("/{job_id}/retry", response_model=JobOut)
def retry_job(job_id: str, queue: QueueDep) -> JobOut:
    try:
        job = queue.retry(job_id)
    except JobNotFound as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except JobNotRetryable as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return JobOut.model_validate(job)
