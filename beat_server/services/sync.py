"""Pull the channel's uploads into the Library.

``merge_from_youtube`` is the one rule: YouTube owns metadata, counters and status of an
uploaded Beat; the local files (``audio_path``, ``image_path``, ``video_path``) are ours and
are never touched. ``sync_library`` applies it over a list of videos so tests can feed a
canned list; ``run_sync`` is the job handler that fetches the real one.
"""

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from beat_server.db.models import Beat, BeatStatus, new_id, utcnow
from beat_server.db.repo import BeatRepo
from beat_server.jobs.worker import JobContext
from beat_upload.config import MUSIC_CATEGORY_ID, PrivacyStatus
from beat_upload.stats import VideoStats, YouTubeStats


@dataclass(frozen=True)
class SyncResult:
    created: int
    updated: int
    beat_ids: tuple[str, ...] = field(default=())


def status_from_privacy(privacy: str) -> BeatStatus:
    """Public videos are PUBLISHED; private and unlisted ones are merely UPLOADED."""
    return BeatStatus.PUBLISHED if privacy == PrivacyStatus.PUBLIC else BeatStatus.UPLOADED


def status_for(privacy: str, publish_at: datetime | None) -> BeatStatus:
    """private + publish_at -> SCHEDULED, otherwise status_from_privacy(privacy)."""
    if privacy == PrivacyStatus.PRIVATE and publish_at is not None:
        return BeatStatus.SCHEDULED
    return status_from_privacy(privacy)


def parse_published_at(iso: str) -> datetime | None:
    """``2026-09-01T12:30:00Z`` -> naive UTC datetime, like every other timestamp in the DB."""
    if not iso:
        return None
    parsed = datetime.fromisoformat(iso)
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


def merge_from_youtube(beat: Beat | None, video: VideoStats) -> Beat:
    """Pure. New Beat if ``beat`` is None, else overwrite metadata, counters and status.

    Never touches ``audio_path``/``image_path``/``video_path``.
    """
    if beat is None:
        beat = Beat(id=new_id(), youtube_id=video.id, category_id=MUSIC_CATEGORY_ID)
    beat.title = video.title
    beat.description = video.description
    beat.tags = list(video.tags)
    beat.privacy = video.privacy
    beat.status = status_from_privacy(video.privacy)
    beat.published_at = parse_published_at(video.published_at)
    beat.views = video.views
    beat.likes = video.likes
    beat.comments = video.comments
    beat.synced_at = utcnow()
    return beat


def sync_library(
    session: Session, videos: list[VideoStats], *, log: Callable[[str], None]
) -> SyncResult:
    """Upsert one Beat per video by ``youtube_id``. Returns counts and every touched id."""
    repo = BeatRepo(session)
    created = updated = 0
    ids: list[str] = []
    for video in videos:
        existing = repo.by_youtube_id(video.id)
        beat = merge_from_youtube(existing, video)
        if existing is None:
            repo.add(beat)
            created += 1
        else:
            repo.save(beat)
            updated += 1
        ids.append(beat.id)
    log(f"Synced {len(videos)} videos: {created} new, {updated} updated")
    return SyncResult(created=created, updated=updated, beat_ids=tuple(ids))


async def run_sync(ctx: JobContext) -> None:
    """SYNC job: fetch every upload of the channel, then merge on the loop thread."""
    creds = ctx.credentials()
    ctx.progress(0.0, "Fetching channel uploads")
    videos = await asyncio.to_thread(YouTubeStats(creds).videos)
    ctx.progress(0.5, f"{len(videos)} videos on the channel")
    result = sync_library(ctx.session, videos, log=ctx.log)
    repo = BeatRepo(ctx.session)
    for beat_id in result.beat_ids:
        beat = repo.get(beat_id)
        if beat is not None:
            ctx.bus.publish_beat(beat.id, beat.status)
    ctx.progress(1.0, f"Synced: {result.created} new, {result.updated} updated")
