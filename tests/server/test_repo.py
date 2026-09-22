from datetime import date, datetime

from sqlalchemy.orm import Session

from beat_server.db.models import Beat, Job, JobKind, JobStatus, VideoStatsDaily
from beat_server.db.repo import BeatRepo, JobRepo, SettingsRepo, StatsRepo


def test_beat_add_get_list_newest_first(session: Session) -> None:
    repo = BeatRepo(session)
    old = repo.add(Beat(title="old", tags=["a"], created_at=datetime(2026, 1, 1)))
    new = repo.add(Beat(title="new", created_at=datetime(2026, 2, 1)))

    assert repo.get(old.id) is old
    assert repo.get("missing") is None
    assert [b.id for b in repo.list()] == [new.id, old.id]
    assert repo.get(old.id).tags == ["a"]


def test_beat_by_youtube_id_and_save(session: Session) -> None:
    repo = BeatRepo(session)
    beat = repo.add(Beat(title="x", youtube_id="yt1"))
    beat.views = 42
    repo.save(beat)

    found = repo.by_youtube_id("yt1")
    assert found is not None and found.views == 42
    assert repo.by_youtube_id("nope") is None


def test_job_next_queued_is_oldest_and_skips_running(session: Session) -> None:
    repo = JobRepo(session)
    repo.add(Job(kind=JobKind.SYNC, status=JobStatus.RUNNING, created_at=datetime(2026, 1, 1)))
    second = repo.add(Job(kind=JobKind.RENDER, beat_id="b", created_at=datetime(2026, 1, 3)))
    first = repo.add(Job(kind=JobKind.UPLOAD, beat_id="b", created_at=datetime(2026, 1, 2)))

    assert repo.next_queued() is first
    assert [j.id for j in repo.running()] != []
    assert [j.id for j in repo.for_beat("b")] == [second.id, first.id]

    first.status = JobStatus.DONE
    repo.save(first)
    assert repo.next_queued() is second


def test_job_next_queued_none_when_empty(session: Session) -> None:
    assert JobRepo(session).next_queued() is None


def test_stats_upsert_is_idempotent(session: Session) -> None:
    repo = StatsRepo(session)
    day = date(2026, 9, 1)
    repo.upsert_daily([VideoStatsDaily(youtube_id="v", day=day, views=1)])
    repo.upsert_daily([VideoStatsDaily(youtube_id="v", day=day, views=5)])
    repo.upsert_daily([VideoStatsDaily(youtube_id="v", day=date(2026, 9, 2), views=2)])

    rows = repo.daily("v", day, date(2026, 9, 30))
    assert [(r.day, r.views) for r in rows] == [(day, 5), (date(2026, 9, 2), 2)]
    assert repo.last_day() == date(2026, 9, 2)


def test_stats_last_day_none_when_empty(session: Session) -> None:
    assert StatsRepo(session).last_day() is None


def test_settings_get_set(session: Session) -> None:
    repo = SettingsRepo(session)
    assert repo.get("stats_hour") is None
    repo.set("stats_hour", "4")
    repo.set("stats_hour", "5")
    assert repo.get("stats_hour") == "5"
