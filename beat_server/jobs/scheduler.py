"""Enqueue the nightly STATS job and the catch-up SYNC for Scheduled Beats.

Once a day at ``stats_hour`` (local time, from settings) a STATS job is created. The rule is
"at most one STATS job per calendar day, created no earlier than the hour": if the laptop
was asleep at the hour, the next tick (including the first one at startup) catches up.
A run that FAILED (network retries exhausted, API error) does not count as today's run:
it is tried again ``FAILED_RETRY_INTERVAL`` after it finished, at most
``MAX_FAILED_RETRIES_PER_DAY`` times a day so a permanently broken API does not spam jobs.

The second rule (ADR 0003): YouTube publishes a Scheduled Beat on its own, so once its
``publish_at`` has passed the local status lags until a sync. Every tick enqueues one SYNC
job per Scheduled Beat whose time has passed and that has not been synced later than
``publish_at + SYNC_GRACE`` (YouTube flips the video up to a minute or so after the time,
so a sync right after ``publish_at`` may still see it Scheduled), skipping Beats with a
SYNC already pending. After a successful sync the Beat is Published (or Uploaded, or still
Scheduled with a later time), so the rule stops; a video YouTube refuses to publish gets
at most ~``SYNC_GRACE / TICK_INTERVAL`` syncs and then stays Scheduled without more jobs.

Every timestamp here is naive local time; ``Job.created_at`` and ``Beat.publish_at`` are
naive UTC and are converted.
"""

import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session, sessionmaker

from beat_server.db.models import Job, JobKind, JobStatus
from beat_server.db.repo import BeatRepo, JobRepo
from beat_server.jobs.queue import JobQueue

log = logging.getLogger(__name__)

TICK_INTERVAL = 60.0
FAILED_RETRY_INTERVAL = timedelta(hours=1)
MAX_FAILED_RETRIES_PER_DAY = 3
# How long after ``publish_at`` a still-Scheduled Beat keeps getting catch-up syncs.
SYNC_GRACE = timedelta(minutes=10)


def utc_to_local(naive_utc: datetime) -> datetime:
    return naive_utc.replace(tzinfo=UTC).astimezone().replace(tzinfo=None)


def local_to_utc(naive_local: datetime) -> datetime:
    return naive_local.astimezone().astimezone(UTC).replace(tzinfo=None)


class Scheduler:
    def __init__(
        self,
        queue: JobQueue,
        session_factory: sessionmaker[Session],
        *,
        hour_getter: Callable[[Session], int],
        tick_interval: float = TICK_INTERVAL,
        clock: Callable[[], datetime] = datetime.now,
    ) -> None:
        self._queue = queue
        self._session_factory = session_factory
        self._hour_getter = hour_getter
        self._tick_interval = tick_interval
        self._clock = clock

    @staticmethod
    def next_due(
        now: datetime, last_run: datetime | None, *, hour: int, last_failed: bool = False
    ) -> datetime:
        """When the next STATS job is due (local time).

        ``last_run`` is when the last job was created, or, with ``last_failed=True``, when
        it failed. Already ran today -> tomorrow at ``hour``. Otherwise today at ``hour``,
        which may be in the past: that is the catch-up case (asleep at the hour, or a
        missed day). After a failure: ``FAILED_RETRY_INTERVAL`` later, but never before
        the hour of the day the retry lands on (a failure at 23:30 waits for tomorrow's
        hour, not 00:30: the day's data is not complete yet).
        """
        due_today = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if last_run is None:
            return due_today
        if last_failed:
            retry = last_run + FAILED_RETRY_INTERVAL
            return max(retry, retry.replace(hour=hour, minute=0, second=0, microsecond=0))
        if last_run.date() >= now.date():
            return due_today + timedelta(days=1)
        return due_today

    def tick(self) -> Job | None:
        """Run both rules. Returns the STATS job if one was due, or None."""
        now = self._clock()
        self.sync_due_scheduled(now)
        return self.tick_stats(now)

    def sync_due_scheduled(self, now: datetime) -> list[Job]:
        """Enqueue one SYNC per Scheduled Beat whose time has passed and that was not
        synced later than ``publish_at + SYNC_GRACE``."""
        with self._session_factory() as session:
            jobs = JobRepo(session)
            due = [
                beat
                for beat in BeatRepo(session).due_scheduled(local_to_utc(now), grace=SYNC_GRACE)
                if not jobs.has_pending(JobKind.SYNC, beat.id)
            ]
        enqueued: list[Job] = []
        for beat in due:
            log.info(
                "scheduled beat %s was due at %s UTC; enqueueing sync", beat.id, beat.publish_at
            )
            enqueued.append(self._queue.enqueue(JobKind.SYNC, beat.id))
        return enqueued

    def tick_stats(self, now: datetime) -> Job | None:
        """Enqueue a STATS job if one is due. Returns it, or None."""
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        with self._session_factory() as session:
            hour = self._hour_getter(session)
            repo = JobRepo(session)
            latest = repo.latest(JobKind.STATS)
            failed_today = repo.count_finished_since(
                JobKind.STATS, JobStatus.FAILED, local_to_utc(day_start)
            )
        last_run: datetime | None = None
        last_failed = False
        if latest is not None:
            last_failed = (
                latest.status == JobStatus.FAILED
                and latest.finished_at is not None
                and failed_today < MAX_FAILED_RETRIES_PER_DAY
            )
            # A failed run is dated by when it failed, a good one by when it was created
            # (a catch-up run created at 23:50 that finishes at 00:05 was yesterday's).
            last_run = utc_to_local(latest.finished_at if last_failed else latest.created_at)
        if now < self.next_due(now, last_run, hour=hour, last_failed=last_failed):
            return None
        log.info("stats job due (hour=%d, last run %s); enqueueing", hour, last_run)
        return self._queue.enqueue(JobKind.STATS)

    async def run_forever(self) -> None:
        """Tick immediately (catch-up after sleep/restart), then every ``tick_interval``."""
        while True:
            try:
                self.tick()
            except Exception:  # noqa: BLE001
                # Like the worker loop: a DB hiccup must not kill the schedule for good.
                log.exception("scheduler tick failed; retrying next interval")
            await asyncio.sleep(self._tick_interval)
