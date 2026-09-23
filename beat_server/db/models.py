"""SQLAlchemy tables. Schema changes go through Alembic migrations in ``migrations/``."""

import uuid
from datetime import UTC, date, datetime
from enum import StrEnum

from sqlalchemy import JSON, Date, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class BeatStatus(StrEnum):
    DRAFT = "draft"
    QUEUED = "queued"
    RENDERING = "rendering"
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    PUBLISHED = "published"


class JobKind(StrEnum):
    RENDER = "render"
    UPLOAD = "upload"
    SYNC = "sync"
    STATS = "stats"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    PAUSED = "paused"


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Beat(Base):
    __tablename__ = "beats"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    status: Mapped[BeatStatus] = mapped_column(String(16), default=BeatStatus.DRAFT, nullable=False)
    title: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    category_id: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    privacy: Mapped[str] = mapped_column(String(16), default="private", nullable=False)
    youtube_id: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True)
    audio_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    image_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    video_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    likes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    comments: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    beat_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    kind: Mapped[JobKind] = mapped_column(String(16), nullable=False)
    status: Mapped[JobStatus] = mapped_column(
        String(16), default=JobStatus.QUEUED, nullable=False, index=True
    )
    progress: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Retry bookkeeping for transient (network) failures, see ``jobs/worker.py``.
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    not_before: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class VideoStatsDaily(Base):
    """One row per video per day, from the Analytics API."""

    __tablename__ = "video_stats_daily"

    youtube_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    watch_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_view_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_view_percent: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)


class Setting(Base):
    """Key/value: google_client_id, stats_hour, ..."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
