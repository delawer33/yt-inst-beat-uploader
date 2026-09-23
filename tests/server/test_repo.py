from datetime import date, datetime

from sqlalchemy.orm import Session

from beat_server.db.models import Beat, BeatStatus, Job, JobKind, JobStatus, VideoStatsDaily
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


def test_beat_due_scheduled(session: Session) -> None:
    repo = BeatRepo(session)
    now = datetime(2026, 10, 1, 18, 5)
    passed = datetime(2026, 10, 1, 18, 0)

    def scheduled(
        beat_id: str, publish_at: datetime = passed, synced_at: datetime | None = None
    ) -> Beat:
        beat = Beat(id=beat_id, status=BeatStatus.SCHEDULED, publish_at=publish_at)
        beat.synced_at = synced_at
        return repo.add(beat)

    scheduled("never-synced")
    scheduled("synced-before", synced_at=datetime(2026, 10, 1, 12, 0))
    scheduled("synced-after", synced_at=datetime(2026, 10, 1, 18, 1))
    scheduled("future", publish_at=datetime(2026, 10, 2, 18, 0))
    repo.add(Beat(id="published", status=BeatStatus.PUBLISHED, publish_at=passed))
    repo.add(Beat(id="draft", status=BeatStatus.DRAFT))

    assert [b.id for b in repo.due_scheduled(now)] == ["never-synced", "synced-before"]
    assert repo.due_scheduled(datetime(2026, 10, 1, 17, 59)) == []


def test_job_has_pending(session: Session) -> None:
    repo = JobRepo(session)
    assert repo.has_pending(JobKind.SYNC, "b") is False
    done = repo.add(Job(kind=JobKind.SYNC, beat_id="b", status=JobStatus.DONE))
    assert repo.has_pending(JobKind.SYNC, "b") is False
    repo.add(Job(kind=JobKind.SYNC, beat_id="other"))
    repo.add(Job(kind=JobKind.STATS, beat_id="b"))
    assert repo.has_pending(JobKind.SYNC, "b") is False
    queued = repo.add(Job(kind=JobKind.SYNC, beat_id="b"))
    assert repo.has_pending(JobKind.SYNC, "b") is True
    for status in (JobStatus.RUNNING, JobStatus.PAUSED):
        queued.status = status
        repo.save(queued)
        assert repo.has_pending(JobKind.SYNC, "b") is True
    queued.status = JobStatus.FAILED
    repo.save(queued)
    assert repo.has_pending(JobKind.SYNC, "b") is False
    assert done.status == JobStatus.DONE


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
