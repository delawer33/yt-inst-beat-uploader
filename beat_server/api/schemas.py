"""Pydantic models of the HTTP API. The frontend types are generated from these (OpenAPI)."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from beat_server.db.models import Beat, BeatStatus, JobKind, JobStatus
from beat_upload.config import PrivacyStatus
from beat_upload.youtube import video_url


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
    attempts: int
    not_before: datetime | None


THUMBNAIL_URL = "https://i.ytimg.com/vi/{youtube_id}/hqdefault.jpg"


class BeatOut(BaseModel):
    """A Beat as the Library and Beat pages see it. Build with ``from_beat``."""

    id: str
    status: BeatStatus
    title: str
    description: str
    tags: list[str]
    category_id: int
    privacy: PrivacyStatus
    youtube_id: str | None
    youtube_url: str | None
    published_at: datetime | None
    publish_at: datetime | None
    views: int
    likes: int
    comments: int
    has_files: bool
    cover_url: str | None
    synced_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_beat(cls, beat: Beat) -> "BeatOut":
        return cls(
            id=beat.id,
            status=beat.status,
            title=beat.title,
            description=beat.description,
            tags=list(beat.tags),
            category_id=beat.category_id,
            privacy=PrivacyStatus(beat.privacy),
            youtube_id=beat.youtube_id,
            youtube_url=video_url(beat.youtube_id) if beat.youtube_id else None,
            published_at=beat.published_at,
            publish_at=beat.publish_at,
            views=beat.views,
            likes=beat.likes,
            comments=beat.comments,
            has_files=bool(beat.audio_path and beat.image_path),
            cover_url=cover_url_for(beat),
            synced_at=beat.synced_at,
            created_at=beat.created_at,
            updated_at=beat.updated_at,
        )


def cover_url_for(beat: Beat) -> str | None:
    """Local cover when we have one, else the YouTube thumbnail, else nothing."""
    if beat.image_path:
        return f"/api/beats/{beat.id}/cover"
    if beat.youtube_id:
        return THUMBNAIL_URL.format(youtube_id=beat.youtube_id)
    return None


class BeatPatch(BaseModel):
    """Editable metadata (slice 5, ``PATCH /api/beats/{id}``). Declared here so the schema
    file is one place; validation reuses ``YouTubeMetadata.from_mapping``."""

    title: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    privacy: PrivacyStatus | None = None
    # Scheduled publish time; ``null`` clears it (check ``model_fields_set`` to tell the two
    # apart from "not sent"). A naive value counts as local time, like in config.yaml.
    publish_at: datetime | None = None


class PrivacyIn(BaseModel):
    """``POST /api/beats/{id}/privacy``. With ``publish_at`` the beat becomes Scheduled
    (YouTube publishes it then; ``privacy`` is sent as private); without it any existing
    schedule is removed. A naive value counts as local time, like in config.yaml."""

    privacy: PrivacyStatus
    publish_at: datetime | None = None
