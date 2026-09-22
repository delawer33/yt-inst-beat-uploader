"""``POST /api/sync``: pull the channel's uploads into the Library, as a background job."""

from fastapi import APIRouter

from beat_server.api.jobs import QueueDep
from beat_server.api.schemas import JobOut
from beat_server.db.models import JobKind

router = APIRouter(prefix="/api", tags=["jobs"])


@router.post("/sync", response_model=JobOut)
def trigger_sync(queue: QueueDep) -> JobOut:
    return JobOut.model_validate(queue.enqueue(JobKind.SYNC))
