"""Thin, typed data access. No business rules live here."""

from datetime import date, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from beat_server.db.models import (
    Beat,
    BeatStatus,
    Job,
    JobKind,
    JobStatus,
    Setting,
    VideoStatsDaily,
    utcnow,
)

PENDING = (JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.PAUSED)


class BeatRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, beat_id: str) -> Beat | None:
        return self.session.get(Beat, beat_id)

    def by_youtube_id(self, youtube_id: str) -> Beat | None:
        return self.session.scalar(select(Beat).where(Beat.youtube_id == youtube_id))

    def due_scheduled(self, now: datetime) -> list[Beat]:
        """Scheduled Beats whose ``publish_at`` (naive UTC) has passed and that have not
        been synced since: ``synced_at`` is unset or earlier than ``publish_at``."""
        stmt = (
            select(Beat)
            .where(Beat.status == BeatStatus.SCHEDULED)
            .where(Beat.publish_at <= now)
            .where(or_(Beat.synced_at.is_(None), Beat.synced_at < Beat.publish_at))
            .order_by(Beat.publish_at, Beat.id)
        )
        return list(self.session.scalars(stmt))

    def list(self) -> list[Beat]:
        """Newest first: by publish date, drafts by the day they were added."""
        newest = func.coalesce(Beat.published_at, Beat.created_at)
        stmt = select(Beat).order_by(newest.desc(), Beat.created_at.desc(), Beat.id)
        return list(self.session.scalars(stmt))

    def add(self, beat: Beat) -> Beat:
        self.session.add(beat)
        self.session.commit()
        return beat

    def save(self, beat: Beat) -> Beat:
        self.session.add(beat)
        self.session.commit()
        return beat

    def delete(self, beat: Beat) -> None:
        self.session.delete(beat)
        self.session.commit()


class JobRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, job_id: str) -> Job | None:
        return self.session.get(Job, job_id)

    def add(self, job: Job) -> Job:
        self.session.add(job)
        self.session.commit()
        return job

    def next_queued(self) -> Job | None:
        """The oldest job still waiting to run whose retry delay (``not_before``) has passed."""
        now = utcnow()
        stmt = (
            select(Job)
            .where(Job.status == JobStatus.QUEUED)
            .where(or_(Job.not_before.is_(None), Job.not_before <= now))
            .order_by(Job.created_at, Job.id)
            .limit(1)
        )
        return self.session.scalar(stmt)

    def running(self) -> list[Job]:
        stmt = select(Job).where(Job.status == JobStatus.RUNNING).order_by(Job.started_at)
        return list(self.session.scalars(stmt))

    def with_status(self, status: JobStatus) -> list[Job]:
        stmt = select(Job).where(Job.status == status).order_by(Job.created_at, Job.id)
        return list(self.session.scalars(stmt))

    def for_beat(self, beat_id: str) -> list[Job]:
        """Newest first."""
        stmt = select(Job).where(Job.beat_id == beat_id).order_by(Job.created_at.desc(), Job.id)
        return list(self.session.scalars(stmt))

    def list(self, limit: int | None = None) -> list[Job]:
        """Newest first."""
        stmt = select(Job).order_by(Job.created_at.desc(), Job.id)
        if limit is not None:
            stmt = stmt.limit(limit)
        return list(self.session.scalars(stmt))

    def count_finished_since(self, kind: JobKind, status: JobStatus, since: datetime) -> int:
        """How many jobs of ``kind`` reached ``status`` at or after ``since`` (naive UTC)."""
        stmt = (
            select(func.count())
            .select_from(Job)
            .where(Job.kind == kind, Job.status == status, Job.finished_at >= since)
        )
        return self.session.scalar(stmt) or 0

    def has_pending(self, kind: JobKind, beat_id: str) -> bool:
        """Is a job of ``kind`` for ``beat_id`` queued, running or paused right now?"""
        stmt = (
            select(func.count())
            .select_from(Job)
            .where(Job.kind == kind, Job.beat_id == beat_id, Job.status.in_(PENDING))
        )
        return bool(self.session.scalar(stmt))

    def latest(self, kind: JobKind) -> Job | None:
        """The most recently created job of ``kind``, whatever its status."""
        stmt = select(Job).where(Job.kind == kind).order_by(Job.created_at.desc(), Job.id).limit(1)
        return self.session.scalar(stmt)

    def save(self, job: Job) -> Job:
        self.session.add(job)
        self.session.commit()
        return job


class StatsRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    def upsert_daily(self, rows: list[VideoStatsDaily]) -> None:
        for row in rows:
            self.session.merge(row)
        self.session.commit()

    def daily(self, youtube_id: str, start: date, end: date) -> list[VideoStatsDaily]:
        stmt = (
            select(VideoStatsDaily)
            .where(
                VideoStatsDaily.youtube_id == youtube_id,
                VideoStatsDaily.day >= start,
                VideoStatsDaily.day <= end,
            )
            .order_by(VideoStatsDaily.day)
        )
        return list(self.session.scalars(stmt))

    def daily_all(self, start: date, end: date) -> list[VideoStatsDaily]:
        """Every video's rows in the range, ordered by day."""
        stmt = (
            select(VideoStatsDaily)
            .where(VideoStatsDaily.day >= start, VideoStatsDaily.day <= end)
            .order_by(VideoStatsDaily.day, VideoStatsDaily.youtube_id)
        )
        return list(self.session.scalars(stmt))

    def last_day(self) -> date | None:
        stmt = select(VideoStatsDaily.day).order_by(VideoStatsDaily.day.desc()).limit(1)
        return self.session.scalar(stmt)


class SettingsRepo:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, key: str) -> str | None:
        row = self.session.get(Setting, key)
        return row.value if row else None

    def set(self, key: str, value: str) -> None:
        self.session.merge(Setting(key=key, value=value))
        self.session.commit()

    def delete(self, key: str) -> None:
        row = self.session.get(Setting, key)
        if row is not None:
            self.session.delete(row)
            self.session.commit()
