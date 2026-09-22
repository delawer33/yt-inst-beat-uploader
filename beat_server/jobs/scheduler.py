"""Enqueue the nightly STATS job.

Once a day at ``stats_hour`` (local time, from settings) a STATS job is created. The rule is
"at most one STATS job per calendar day, created no earlier than the hour": if the laptop
was asleep at the hour, the next tick (including the first one at startup) catches up.
Every timestamp here is naive local time; ``Job.created_at`` is naive UTC and is converted.
"""

import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session, sessionmaker

from beat_server.db.models import Job, JobKind
from beat_server.db.repo import JobRepo
from beat_server.jobs.queue import JobQueue

log = logging.getLogger(__name__)

TICK_INTERVAL = 60.0


def utc_to_local(naive_utc: datetime) -> datetime:
    return naive_utc.replace(tzinfo=UTC).astimezone().replace(tzinfo=None)


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
    def next_due(now: datetime, last_run: datetime | None, *, hour: int) -> datetime:
        """When the next STATS job is due, given the last one's creation time (local).

        Already ran today -> tomorrow at ``hour``. Otherwise today at ``hour``, which may be
        in the past: that is the catch-up case (asleep at the hour, or a missed day).
        """
        due_today = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if last_run is not None and last_run.date() >= now.date():
            return due_today + timedelta(days=1)
        return due_today

    def tick(self) -> Job | None:
        """Enqueue a STATS job if one is due. Returns it, or None."""
        now = self._clock()
        with self._session_factory() as session:
            hour = self._hour_getter(session)
            latest = JobRepo(session).latest(JobKind.STATS)
        last_run = utc_to_local(latest.created_at) if latest is not None else None
        if now < self.next_due(now, last_run, hour=hour):
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
