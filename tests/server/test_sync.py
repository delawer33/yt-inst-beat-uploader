"""Library sync: the merge rule, the service over a canned video list, the SYNC job handler."""

import asyncio
from datetime import datetime

import pytest
from fastapi import FastAPI
from sqlalchemy.orm import Session

from beat_server.db.models import Beat, BeatStatus, JobKind, JobStatus
from beat_server.db.repo import BeatRepo, JobRepo
from beat_server.jobs.events import Event
from beat_server.jobs.handlers import HANDLERS
from beat_server.jobs.worker import JobContext, Worker
from beat_server.services import sync as sync_service
from beat_server.services.sync import (
    SyncResult,
    merge_from_youtube,
    status_from_privacy,
    sync_library,
)
from beat_upload.config import MUSIC_CATEGORY_ID
from beat_upload.stats import VideoStats


def video(
    video_id: str = "abc123",
    *,
    privacy: str = "public",
    views: int = 1234,
    title: str = "Dark Trap Beat",
) -> VideoStats:
    return VideoStats(
        id=video_id,
        title=title,
        published_at="2026-09-01T12:30:00Z",
        privacy=privacy,
        duration_seconds=180,
        views=views,
        likes=12,
        comments=3,
        tags=["trap", "dark"],
        description="free for profit",
    )


def test_status_from_privacy() -> None:
    assert status_from_privacy("public") == BeatStatus.PUBLISHED
    assert status_from_privacy("unlisted") == BeatStatus.UPLOADED
    assert status_from_privacy("private") == BeatStatus.UPLOADED
    assert status_from_privacy("") == BeatStatus.UPLOADED


def test_merge_new_beat_copies_metadata_and_counters() -> None:
    beat = merge_from_youtube(None, video())

    assert beat.id and len(beat.id) == 36
    assert beat.youtube_id == "abc123"
    assert beat.title == "Dark Trap Beat"
    assert beat.description == "free for profit"
    assert beat.tags == ["trap", "dark"]
    assert beat.category_id == MUSIC_CATEGORY_ID
    assert beat.privacy == "public"
    assert beat.status == BeatStatus.PUBLISHED
    assert beat.published_at == datetime(2026, 9, 1, 12, 30)
    assert (beat.views, beat.likes, beat.comments) == (1234, 12, 3)
    assert beat.synced_at is not None
    assert (beat.audio_path, beat.image_path, beat.video_path) == (None, None, None)


def test_merge_new_unlisted_beat_is_uploaded() -> None:
    assert merge_from_youtube(None, video(privacy="unlisted")).status == BeatStatus.UPLOADED


def test_merge_existing_keeps_files_and_overwrites_the_rest() -> None:
    existing = Beat(
        id="local-id",
        youtube_id="abc123",
        title="old title",
        status=BeatStatus.UPLOADED,
        privacy="private",
        views=1,
        audio_path="beat.mp3",
        image_path="cover.png",
        video_path="video.mp4",
    )

    merged = merge_from_youtube(existing, video(views=999))

    assert merged is existing
    assert merged.id == "local-id"
    assert merged.title == "Dark Trap Beat"
    assert merged.privacy == "public"
    assert merged.status == BeatStatus.PUBLISHED
    assert merged.views == 999
    assert merged.synced_at is not None
    assert (merged.audio_path, merged.image_path, merged.video_path) == (
        "beat.mp3",
        "cover.png",
        "video.mp4",
    )


def test_sync_library_creates_and_updates(session: Session) -> None:
    repo = BeatRepo(session)
    repo.add(Beat(youtube_id="old1", title="stale", views=0))
    lines: list[str] = []

    result = sync_library(
        session,
        [video("old1", views=50), video("new1"), video("new2")],
        log=lines.append,
    )

    assert isinstance(result, SyncResult)
    assert (result.created, result.updated) == (2, 1)
    session.expire_all()
    beats = {b.youtube_id: b for b in repo.list()}
    assert set(beats) == {"old1", "new1", "new2"}
    assert beats["old1"].views == 50 and beats["old1"].title == "Dark Trap Beat"
    assert len(result.beat_ids) == 3
    assert lines  # the service narrates what it did


class FakeYouTubeStats:
    def __init__(self, credentials: object) -> None:
        self.credentials = credentials

    def videos(self) -> list[VideoStats]:
        return [video("v1"), video("v2", privacy="private")]


async def test_run_sync_handler(
    app: FastAPI, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sync_service, "YouTubeStats", FakeYouTubeStats)
    monkeypatch.setattr(JobContext, "credentials", lambda self: object())
    received: list[Event] = []

    async def listen() -> None:
        async for event in app.state.bus.subscribe():
            received.append(event)

    listener = asyncio.create_task(listen())
    await asyncio.sleep(0)

    job = app.state.queue.enqueue(JobKind.SYNC)
    worker = Worker(
        app.state.queue, HANDLERS, app.state.session_factory, app.state.workspace, app.state.bus
    )
    await worker.run_one(job)
    await asyncio.sleep(0.05)
    listener.cancel()

    session.expire_all()
    job = JobRepo(session).get(job.id)  # type: ignore[assignment]
    assert job.status == JobStatus.DONE and job.progress == 1.0
    beats = {b.youtube_id: b.status for b in BeatRepo(session).list()}
    assert beats == {"v1": BeatStatus.PUBLISHED, "v2": BeatStatus.UPLOADED}
    beat_events = [e for e in received if e.type == "beat"]
    assert {e.payload["status"] for e in beat_events} == {"published", "uploaded"}
