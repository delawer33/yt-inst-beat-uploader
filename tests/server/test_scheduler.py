"""The scheduler's second rule: a catch-up SYNC once a Scheduled Beat's time has passed.

The STATS rule is covered in ``test_stats.py``. The clock is faked (local time, like the
real ``datetime.now``); ``Beat.publish_at`` and ``Beat.synced_at`` are naive UTC.
"""

from datetime import datetime, timedelta

from fastapi import FastAPI
from sqlalchemy.orm import Session

from beat_server.db.models import Beat, BeatStatus, Job, JobKind, JobStatus
from beat_server.db.repo import BeatRepo, JobRepo
from beat_server.jobs.scheduler import Scheduler, local_to_utc

# Local noon on a day in the past so the STATS rule (hour=0, already ran) stays quiet.
NOW = datetime(2026, 10, 1, 12, 0)


def make_scheduler(app: FastAPI, now: datetime = NOW) -> Scheduler:
    return Scheduler(
        app.state.queue,
        app.state.session_factory,
        hour_getter=lambda session: 0,
        clock=lambda: now,
    )


def quiet_stats(session: Session) -> None:
    """A STATS job already created today, so ``tick`` only exercises the SYNC rule."""
    JobRepo(session).add(
        Job(kind=JobKind.STATS, status=JobStatus.DONE, created_at=local_to_utc(NOW))
    )


def scheduled(session: Session, offset: timedelta, *, synced_at: datetime | None = None) -> Beat:
    return BeatRepo(session).add(
        Beat(
            youtube_id="v1",
            status=BeatStatus.SCHEDULED,
            privacy="private",
            publish_at=local_to_utc(NOW + offset),
            synced_at=synced_at,
        )
    )


def sync_jobs(session: Session) -> list[Job]:
    return [j for j in JobRepo(session).list() if j.kind == JobKind.SYNC]


def test_due_beat_gets_exactly_one_sync(app: FastAPI, session: Session) -> None:
    quiet_stats(session)
    beat = scheduled(session, timedelta(minutes=-1))

    assert make_scheduler(app).tick() is None  # no STATS job was due
    jobs = sync_jobs(session)
    assert len(jobs) == 1
    assert jobs[0].beat_id == beat.id and jobs[0].status == JobStatus.QUEUED


def test_future_beat_is_left_alone(app: FastAPI, session: Session) -> None:
    quiet_stats(session)
    scheduled(session, timedelta(minutes=1))

    make_scheduler(app).tick()
    assert sync_jobs(session) == []


def test_beat_synced_after_its_time_is_not_synced_again(app: FastAPI, session: Session) -> None:
    quiet_stats(session)
    # Still SCHEDULED after a sync that ran past the time: YouTube did not publish it.
    scheduled(session, timedelta(hours=-1), synced_at=local_to_utc(NOW - timedelta(minutes=30)))

    make_scheduler(app).tick()
    assert sync_jobs(session) == []


def test_beat_synced_before_its_time_is_due(app: FastAPI, session: Session) -> None:
    quiet_stats(session)
    scheduled(session, timedelta(hours=-1), synced_at=local_to_utc(NOW - timedelta(hours=2)))

    assert len(make_scheduler(app).sync_due_scheduled(NOW)) == 1


def test_second_tick_does_not_duplicate_a_pending_sync(app: FastAPI, session: Session) -> None:
    quiet_stats(session)
    scheduled(session, timedelta(minutes=-1))
    scheduler = make_scheduler(app)

    scheduler.tick()
    scheduler.tick()
    make_scheduler(app, NOW + timedelta(minutes=5)).tick()
    assert len(sync_jobs(session)) == 1

    # ... nor while the worker is on it, or it waits for Google to be connected.
    job = sync_jobs(session)[0]
    for status in (JobStatus.RUNNING, JobStatus.PAUSED):
        job.status = status
        JobRepo(session).save(job)
        scheduler.tick()
        assert len(sync_jobs(session)) == 1


def test_after_the_sync_marks_it_published_nothing_more_is_enqueued(
    app: FastAPI, session: Session
) -> None:
    quiet_stats(session)
    beat = scheduled(session, timedelta(minutes=-1))
    scheduler = make_scheduler(app)
    scheduler.tick()

    # What run_sync does when YouTube has flipped the video: status + synced_at move on.
    job = sync_jobs(session)[0]
    job.status = JobStatus.DONE
    JobRepo(session).save(job)
    beat.status = BeatStatus.PUBLISHED
    beat.publish_at = None
    beat.synced_at = local_to_utc(NOW)
    BeatRepo(session).save(beat)

    scheduler.tick()
    make_scheduler(app, NOW + timedelta(days=1)).tick()
    assert len(sync_jobs(session)) == 1


def test_one_sync_per_due_beat_and_the_stats_rule_still_runs(
    app: FastAPI, session: Session
) -> None:
    repo = BeatRepo(session)
    for i in range(2):
        repo.add(
            Beat(
                youtube_id=f"v{i}",
                status=BeatStatus.SCHEDULED,
                publish_at=local_to_utc(NOW - timedelta(minutes=i + 1)),
            )
        )

    stats = make_scheduler(app).tick()

    assert stats is not None and stats.kind == JobKind.STATS
    assert len(sync_jobs(session)) == 2
