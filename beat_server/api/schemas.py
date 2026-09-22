"""Pydantic models of the HTTP API. The frontend types are generated from these (OpenAPI)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from beat_server.db.models import JobKind, JobStatus


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    beat_id: str | None
    kind: JobKind
    status: JobStatus
    progress: float
    message: str
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
