"""Daily stats: which days to fetch, storing a day, the STATS job, the scheduler, the API."""

from datetime import date, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from beat_server.db.models import Beat, BeatStatus, Job, JobKind, JobStatus, VideoStatsDaily
from beat_server.db.repo import BeatRepo, JobRepo, StatsRepo
from beat_server.jobs.handlers import HANDLERS
from beat_server.jobs.scheduler import (
    FAILED_RETRY_INTERVAL,
    MAX_FAILED_RETRIES_PER_DAY,
    Scheduler,
    local_to_utc,
)
from beat_server.jobs.worker import JobContext, Worker
from beat_server.services import stats as stats_service
from beat_server.services.stats import collect_day, missing_days
from beat_upload.analytics import VideoAnalytics
from beat_upload.stats import VideoStats

TODAY = date(2026, 9, 22)
YESTERDAY = TODAY - timedelta(days=1)


# --- missing_days -----------------------------------------------------------------------


def test_missing_days_backfills_90_days_ending_yesterday() -> None:
    days = missing_days(None, TODAY)
    assert len(days) == 90
    assert days[0] == TODAY - timedelta(days=90)
    assert days[-1] == YESTERDAY
    assert days == sorted(days)


def test_missing_days_up_to_date_is_empty() -> None:
    assert missing_days(YESTERDAY, TODAY) == []
    assert missing_days(TODAY, TODAY) == []


def test_missing_days_after_last() -> None:
    assert missing_days(TODAY - timedelta(days=3), TODAY) == [
        TODAY - timedelta(days=2),
        YESTERDAY,
    ]


def test_missing_days_never_exceeds_backfill() -> None:
    days = missing_days(TODAY - timedelta(days=400), TODAY, backfill_days=30)
    assert len(days) == 30 and days[-1] == YESTERDAY


# --- collect_day ------------------------------------------------------------------------


def analytics_row(video_id: str, views: int = 10) -> VideoAnalytics:
    return VideoAnalytics(
        id=video_id,
        views=views,
        watch_minutes=views * 2,
        avg_view_seconds=90,
        avg_view_percent=45.5,
    )


class FakeAnalytics:
    """Same two videos every day; records the requested ranges."""

    def __init__(self, credentials: object = None) -> None:
        self.calls: list[tuple[date, date]] = []

    def videos(self, start: date, end: date) -> list[VideoAnalytics]:
        self.calls.append((start, end))
        return [analytics_row("v1", 10), analytics_row("v2", 3)]


def test_collect_day_upserts_and_is_idempotent(session: Session) -> None:
    analytics = FakeAnalytics()
    day = date(2026, 9, 10)

    assert collect_day(session, analytics, day) == 2  # type: ignore[arg-type]
    assert collect_day(session, analytics, day) == 2  # type: ignore[arg-type]

    assert analytics.calls == [(day, day), (day, day)]
    rows = StatsRepo(session).daily_all(day, day)
    assert [(r.youtube_id, r.views, r.watch_minutes) for r in rows] == [
        ("v1", 10, 20),
        ("v2", 3, 6),
    ]
    assert rows[0].avg_view_seconds == 90 and rows[0].avg_view_percent == 45.5


# --- run_stats --------------------------------------------------------------------------


class FakeYouTubeStats:
    def __init__(self, credentials: object) -> None:
        pass

    def videos(self) -> list[VideoStats]:
        return [
            VideoStats(
                id="v1",
                title="Beat one",
                published_at="2026-09-01T12:30:00Z",
                privacy="public",
                duration_seconds=180,
                views=500,
                likes=1,
                comments=0,
                tags=[],
                description="",
            )
        ]


async def test_run_stats_fills_missing_days_and_refreshes_counters(
    app: FastAPI, session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(stats_service, "YouTubeAnalytics", FakeAnalytics)
    monkeypatch.setattr(stats_service, "YouTubeStats", FakeYouTubeStats)
    monkeypatch.setattr(JobContext, "credentials", lambda self: object())
    BeatRepo(session).add(Beat(youtube_id="v1", title="stale", views=0))
    # History up to three days ago: two days are missing.
    last = date.today() - timedelta(days=3)
    StatsRepo(session).upsert_daily([VideoStatsDaily(youtube_id="v1", day=last, views=1)])
    progress: list[float] = []
    original = JobContext.progress
    monkeypatch.setattr(
        JobContext,
        "progress",
        lambda self, fraction, message="": (
            progress.append(fraction),
            original(self, fraction, message),
        ),
    )

    job = app.state.queue.enqueue(JobKind.STATS)
    worker = Worker(
        app.state.queue, HANDLERS, app.state.session_factory, app.state.workspace, app.state.bus
    )
    await worker.run_one(job)

    session.expire_all()
    job = JobRepo(session).get(job.id)  # type: ignore[assignment]
    assert job.status == JobStatus.DONE, job.error
    assert progress[-1] == 1.0 and progress == sorted(progress)
    days = sorted({row.day for row in StatsRepo(session).daily_all(last, date.today())})
    assert days == [last, last + timedelta(days=1), last + timedelta(days=2)]
    assert StatsRepo(session).last_day() == date.today() - timedelta(days=1)
    beat = BeatRepo(session).by_youtube_id("v1")
    assert beat is not None and beat.views == 500 and beat.status == BeatStatus.PUBLISHED


def test_stats_handler_is_registered() -> None:
    assert HANDLERS[JobKind.STATS] is stats_service.run_stats


# --- Scheduler --------------------------------------------------------------------------

HOUR = 4
NOON = datetime(2026, 9, 22, 12, 0)


def test_next_due_not_yet_due_today() -> None:
    now = datetime(2026, 9, 22, 3, 30)
    assert Scheduler.next_due(now, None, hour=HOUR) == datetime(2026, 9, 22, 4, 0)


def test_next_due_already_ran_today_is_tomorrow() -> None:
    ran = datetime(2026, 9, 22, 4, 0, 30)
    assert Scheduler.next_due(NOON, ran, hour=HOUR) == datetime(2026, 9, 23, 4, 0)


def test_next_due_missed_run_is_due_now() -> None:
    ran = datetime(2026, 9, 21, 4, 0)
    due = Scheduler.next_due(NOON, ran, hour=HOUR)
    assert due == datetime(2026, 9, 22, 4, 0) and due <= NOON


def test_next_due_never_ran_is_due_now() -> None:
    assert Scheduler.next_due(NOON, None, hour=HOUR) <= NOON


def test_next_due_after_failure_retries_later_today() -> None:
    failed = datetime(2026, 9, 22, 4, 1)
    due = Scheduler.next_due(NOON, failed, hour=HOUR, last_failed=True)
    assert due == failed + FAILED_RETRY_INTERVAL
    assert due <= NOON


def test_next_due_failure_before_the_hour_does_not_shift_it() -> None:
    # A failed manual run at 01:00 must not make the 04:00 run happen at 02:00.
    failed = datetime(2026, 9, 22, 1, 0)
    now = datetime(2026, 9, 22, 2, 30)
    due = Scheduler.next_due(now, failed, hour=HOUR, last_failed=True)
    assert due == datetime(2026, 9, 22, 4, 0)


def test_next_due_failure_late_evening_waits_for_next_days_hour() -> None:
    # 23:30 + 1h would be 00:30: yesterday's data is not complete yet, wait for 04:00.
    failed = datetime(2026, 9, 22, 23, 30)
    now = datetime(2026, 9, 23, 0, 45)
    due = Scheduler.next_due(now, failed, hour=HOUR, last_failed=True)
    assert due == datetime(2026, 9, 23, 4, 0)


def make_scheduler(app: FastAPI, now: datetime, hour: int = HOUR) -> Scheduler:
    return Scheduler(
        app.state.queue,
        app.state.session_factory,
        hour_getter=lambda session: hour,
        clock=lambda: now,
    )


def test_tick_enqueues_once_per_day(app: FastAPI, session: Session) -> None:
    scheduler = make_scheduler(app, datetime.now().replace(hour=23, minute=59))

    first = scheduler.tick()
    second = scheduler.tick()

    assert first is not None and first.kind == JobKind.STATS and first.status == JobStatus.QUEUED
    assert second is None
    assert len(JobRepo(session).list()) == 1


def test_tick_retries_a_failed_run_after_the_interval(app: FastAPI, session: Session) -> None:
    now = datetime.now().replace(hour=20, minute=0)
    scheduler = make_scheduler(app, now)
    first = scheduler.tick()
    assert first is not None
    first.status = JobStatus.FAILED
    first.finished_at = local_to_utc(now)
    JobRepo(session).save(first)

    assert scheduler.tick() is None  # too soon
    later = make_scheduler(app, now + FAILED_RETRY_INTERVAL + timedelta(minutes=1))
    second = later.tick()
    assert second is not None and second.id != first.id
    assert later.tick() is None


def test_tick_stops_retrying_failed_runs_after_the_daily_cap(
    app: FastAPI, session: Session
) -> None:
    now = datetime.now().replace(hour=5, minute=0)
    repo = JobRepo(session)
    for i in range(MAX_FAILED_RETRIES_PER_DAY):
        job = Job(kind=JobKind.STATS, status=JobStatus.FAILED, error="x")
        repo.add(job)
        job.finished_at = local_to_utc(now - timedelta(hours=i))
        repo.save(job)
    scheduler = make_scheduler(app, now + timedelta(hours=8))
    assert scheduler.tick() is None
    assert len(repo.list()) == MAX_FAILED_RETRIES_PER_DAY


def test_tick_counts_a_run_by_its_creation_day(app: FastAPI, session: Session) -> None:
    # Created 23:50 yesterday, finished 00:05 today: that was yesterday's run.
    now = datetime.now().replace(hour=5, minute=0)
    job = Job(kind=JobKind.STATS, status=JobStatus.DONE)
    JobRepo(session).add(job)
    day_start = now.replace(hour=0, minute=0)
    job.created_at = local_to_utc(day_start - timedelta(minutes=10))
    job.finished_at = local_to_utc(day_start + timedelta(minutes=5))
    JobRepo(session).save(job)
    assert make_scheduler(app, now).tick() is not None


def test_tick_waits_for_the_hour(app: FastAPI, session: Session) -> None:
    scheduler = make_scheduler(app, datetime.now().replace(hour=0, minute=0), hour=23)
    assert scheduler.tick() is None
    assert JobRepo(session).list() == []


# --- API --------------------------------------------------------------------------------


@pytest.fixture
def beats(session: Session) -> dict[str, Beat]:
    repo = BeatRepo(session)
    on_yt = repo.add(
        Beat(id="yt", youtube_id="v1", title="On YouTube", status=BeatStatus.PUBLISHED)
    )
    draft = repo.add(Beat(id="draft", title="Draft", status=BeatStatus.DRAFT))
    return {"yt": on_yt, "draft": draft}


def seed_rows(session: Session) -> None:
    yesterday = date.today() - timedelta(days=1)
    StatsRepo(session).upsert_daily(
        [
            VideoStatsDaily(
                youtube_id="v1",
                day=yesterday,
                views=10,
                watch_minutes=20,
                avg_view_seconds=60,
                avg_view_percent=50.0,
            ),
            VideoStatsDaily(
                youtube_id="v2",
                day=yesterday,
                views=30,
                watch_minutes=30,
                avg_view_seconds=20,
                avg_view_percent=10.0,
            ),
            VideoStatsDaily(
                youtube_id="v1", day=yesterday - timedelta(days=2), views=5, watch_minutes=5
            ),
        ]
    )


def test_beat_stats_fills_missing_days_with_zeros(
    client: TestClient, session: Session, beats: dict[str, Beat]
) -> None:
    seed_rows(session)
    response = client.get("/api/beats/yt/stats", params={"days": 7})
    assert response.status_code == 200
    points = response.json()
    assert len(points) == 7
    assert [p["views"] for p in points] == [0, 0, 0, 0, 5, 0, 10]
    assert points[-1]["day"] == (date.today() - timedelta(days=1)).isoformat()
    assert points[-1] == {
        "day": points[-1]["day"],
        "views": 10,
        "watch_minutes": 20,
        "avg_view_seconds": 60,
        "avg_view_percent": 50.0,
    }


def test_beat_stats_without_youtube_id_is_empty(client: TestClient, beats: dict[str, Beat]) -> None:
    assert client.get("/api/beats/draft/stats").json() == []


def test_beat_stats_unknown_beat_is_404(client: TestClient) -> None:
    assert client.get("/api/beats/nope/stats").status_code == 404


def test_overview_sums_across_videos(client: TestClient, session: Session) -> None:
    seed_rows(session)
    response = client.get("/api/stats/overview", params={"days": 3})
    assert response.status_code == 200
    body = response.json()
    assert body["views"] == 45 and body["watch_minutes"] == 55
    assert [p["views"] for p in body["per_day"]] == [5, 0, 40]
    last = body["per_day"][-1]
    assert last["watch_minutes"] == 50
    assert last["avg_view_seconds"] == 30  # (60*10 + 20*30) / 40
    assert last["avg_view_percent"] == 20.0  # (50*10 + 10*30) / 40


def test_overview_default_window_is_28_days(client: TestClient) -> None:
    body = client.get("/api/stats/overview").json()
    assert len(body["per_day"]) == 28 and body["views"] == 0


def test_collect_now_enqueues_stats_job(client: TestClient, session: Session) -> None:
    response = client.post("/api/stats/collect")
    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "stats" and body["status"] == "queued" and body["beat_id"] is None
    assert JobRepo(session).latest(JobKind.STATS) is not None
