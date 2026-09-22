"""Daily per-video statistics from the Analytics API, one row per video per day.

``missing_days`` decides which days to fetch (pure), ``collect_day`` fetches one of them
and upserts the rows (idempotent: the primary key is ``(youtube_id, day)``), ``run_stats``
is the STATS job handler that does both for every missing day and then refreshes the
lifetime counters on the Beat cards through the sync service.
"""

import asyncio
from datetime import date, timedelta

from sqlalchemy.orm import Session

from beat_server.db.models import VideoStatsDaily
from beat_server.db.repo import BeatRepo, StatsRepo
from beat_server.jobs.worker import JobContext
from beat_server.services.sync import sync_library
from beat_upload.analytics import VideoAnalytics, YouTubeAnalytics
from beat_upload.stats import YouTubeStats

BACKFILL_DAYS = 90


def missing_days(
    last: date | None, today: date, *, backfill_days: int = BACKFILL_DAYS
) -> list[date]:
    """Days to collect, oldest first, ending yesterday (today is never complete).

    No history yet -> the ``backfill_days`` days ending yesterday. Otherwise the days after
    ``last``, but never more than ``backfill_days`` of them: the Analytics API answers one
    call per day and a very old ``last`` must not turn into hundreds of calls.
    """
    yesterday = today - timedelta(days=1)
    earliest = today - timedelta(days=backfill_days)
    start = earliest if last is None else max(last + timedelta(days=1), earliest)
    if start > yesterday:
        return []
    return [start + timedelta(days=i) for i in range((yesterday - start).days + 1)]


def store_day(session: Session, day: date, report: list[VideoAnalytics]) -> int:
    """Upsert one day's report. Returns how many videos had data."""
    rows = [
        VideoStatsDaily(
            youtube_id=item.id,
            day=day,
            views=item.views,
            watch_minutes=item.watch_minutes,
            avg_view_seconds=item.avg_view_seconds,
            avg_view_percent=item.avg_view_percent,
        )
        for item in report
    ]
    StatsRepo(session).upsert_daily(rows)
    return len(rows)


def collect_day(session: Session, analytics: YouTubeAnalytics, day: date) -> int:
    """One Analytics call for ``day`` -> upsert its rows. Returns how many videos had data."""
    return store_day(session, day, analytics.videos(day, day))


async def run_stats(ctx: JobContext) -> None:
    """STATS job: fill the daily history up to yesterday, then refresh the Beat counters.

    The API calls run in threads; every database write happens on the loop thread.
    """
    creds = ctx.credentials()
    analytics = YouTubeAnalytics(creds)
    days = missing_days(StatsRepo(ctx.session).last_day(), date.today())
    steps = len(days) + 1  # the counter refresh is the last step
    rows = 0
    for i, day in enumerate(days):
        ctx.progress(i / steps, f"Collecting {day.isoformat()} ({i + 1}/{len(days)})")
        report = await asyncio.to_thread(analytics.videos, day, day)
        rows += store_day(ctx.session, day, report)
    ctx.progress(len(days) / steps, "Refreshing video counters")
    videos = await asyncio.to_thread(YouTubeStats(creds).videos)
    result = sync_library(ctx.session, videos, log=ctx.log)
    repo = BeatRepo(ctx.session)
    for beat_id in result.beat_ids:
        beat = repo.get(beat_id)
        if beat is not None:
            ctx.bus.publish_beat(beat.id, beat.status)
    ctx.progress(1.0, f"Collected {len(days)} days ({rows} rows); {len(videos)} videos refreshed")
