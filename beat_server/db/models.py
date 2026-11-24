"""SQLAlchemy tables. Schema changes go through Alembic migrations in ``migrations/``."""

import uuid
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, Integer, String, Text, false
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from beat_upload.cover_style import DEFAULT_COVER_STYLE, CoverStyle
from beat_upload.placeholders import fields_with_placeholder
from beat_upload.visual import DEFAULT_EFFECT, STILL
from beat_upload.visual.render import EffectMeta


class BeatStatus(StrEnum):
    DRAFT = "draft"
    QUEUED = "queued"
    UPLOADING = "uploading"
    UPLOADED = "uploaded"
    SCHEDULED = "scheduled"  # private on YouTube with a publish_at YouTube will honour
    PUBLISHED = "published"


class JobKind(StrEnum):
    RENDER = "render"
    UPLOAD = "upload"
    SYNC = "sync"
    STATS = "stats"
    BEATSTARS = "beatstars"
    REEL = "reel"


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
    # The audio file's name as the owner dropped it ("Dmin110.mp3"); None on older beats.
    source_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # The Cover Style the owner chose, and the one ``video_path`` was rendered with. They
    # differ while a new Render is due. ``video_style`` is None on videos rendered before
    # Cover Styles existed (sepia); those count as current until the owner picks a style.
    cover_style: Mapped[CoverStyle] = mapped_column(
        String(32),
        default=DEFAULT_COVER_STYLE,
        server_default=DEFAULT_COVER_STYLE.value,
        nullable=False,
    )
    video_style: Mapped[CoverStyle | None] = mapped_column(String(32), nullable=True)
    # The Effect the owner chose (CONTEXT.md). It moves the Reel only (ADR 0012); the YouTube
    # video is always Still.
    effect: Mapped[str] = mapped_column(
        String(32), default=DEFAULT_EFFECT, server_default=DEFAULT_EFFECT, nullable=False
    )
    # The Reel (vertical video for Instagram) beside the video: the Cover Style and the
    # Effect it was rendered with (``reel_effect`` None on files from before Effects, which
    # count as Still), and the header's words (title, artists, bpm, key) an Effect painted
    # into its frames, so a new title makes the file stale. ``reel_meta`` is None on Still.
    reel_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reel_style: Mapped[CoverStyle | None] = mapped_column(String(32), nullable=True)
    reel_effect: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reel_meta: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # The Instagram Post the model wrote (hook, caption_body, hashtags, audio_name, alt_text),
    # None until the owner first opens the panel; and whether the owner posted it by hand.
    instagram_post: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    instagram_posted: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )
    # Set for a Draft made from a Bounce Folder (ADR 0007): the absolute folder path. Then
    # ``audio_path`` / ``image_path`` are absolute too and point into it; nothing is copied.
    bounce_folder: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # The Clip (CONTEXT.md): the Bounce Folder's video standing in for the cover image, an
    # absolute path. ``image_path`` is then a frame of it, written into the beat's dir.
    clip_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    bpm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    music_key: Mapped[str | None] = mapped_column(String(8), nullable=True)  # "Amin"
    # Moods and instruments as the owner wrote them in the Bounce Folder's name.
    name_moods: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    name_instruments: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    samples: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # The same, matched to BeatStars' own lists (by Fill from title).
    beatstars_moods: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    beatstars_instruments: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    beatstars_id: Mapped[str | None] = mapped_column(String(32), nullable=True)  # "TK26393000"
    beatstars_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    beatstars_skipped: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    publish_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # naive UTC
    views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    likes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    comments: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )

    @property
    def header(self) -> dict[str, Any]:
        """The words an Effect paints into the frame, from the title and the Bounce facts."""
        return EffectMeta.of_title(self.title, self.bpm, self.music_key).for_engine()

    @property
    def header_ready(self) -> bool:
        """May the Reel render? Still always; an Effect only once the title names the beat
        (no Placeholders, a name in it), since the header is drawn into every frame. The
        YouTube video is Still and never waits."""
        if self.effect == STILL:
            return True
        return not fields_with_placeholder(self.title, "", []) and bool(self.header["title"])

    @property
    def video_is_current(self) -> bool:
        """Is there a video, rendered in the Cover Style the owner chose? (CONTEXT: Rendered)
        The video is always Still, so the Effect plays no part."""
        return self.video_path is not None and self.video_style in (None, self.cover_style)

    @property
    def reel_is_current(self) -> bool:
        """Is there a Reel, rendered in the Cover Style and the Effect the owner chose, with
        the header's words as they are now?"""
        return (
            self.reel_path is not None
            and self.reel_style == self.cover_style
            and (self.reel_effect or STILL) == self.effect
            and (self.effect == STILL or self.reel_meta == self.header)
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
