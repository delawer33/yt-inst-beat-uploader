"""Daily statistics over HTTP: one beat's history, the channel overview, a manual collect.

Windows end yesterday (the Analytics API has no complete data for today) and are filled
with zero rows for days without data, so charts are continuous.
"""

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from beat_server.api.beats import load_beat
from beat_server.api.jobs import QueueDep
from beat_server.api.schemas import JobOut
from beat_server.db.models import JobKind, VideoStatsDaily
from beat_server.db.repo import StatsRepo
from beat_server.deps import get_session

router = APIRouter(prefix="/api", tags=["stats"])

SessionDep = Annotated[Session, Depends(get_session)]
DaysQuery = Annotated[int, Query(ge=1, le=365)]


class DayPoint(BaseModel):
    day: date
    views: int
    watch_minutes: int
    avg_view_seconds: int
    avg_view_percent: float


class OverviewOut(BaseModel):
    views: int
    watch_minutes: int
    per_day: list[DayPoint]


def window(days: int, today: date | None = None) -> list[date]:
    """The ``days`` days ending yesterday, oldest first."""
    today = today or date.today()
    return [today - timedelta(days=i) for i in range(days, 0, -1)]


def fill_days(days: list[date], rows: list[VideoStatsDaily]) -> list[DayPoint]:
    """One point per day of the window; days without a row are zeros."""
    by_day = {row.day: row for row in rows}
    points: list[DayPoint] = []
    for day in days:
        row = by_day.get(day)
        if row is None:
            points.append(
                DayPoint(
                    day=day, views=0, watch_minutes=0, avg_view_seconds=0, avg_view_percent=0.0
                )
            )
        else:
            points.append(
                DayPoint(
                    day=day,
                    views=row.views,
                    watch_minutes=row.watch_minutes,
                    avg_view_seconds=row.avg_view_seconds,
                    avg_view_percent=row.avg_view_percent,
                )
            )
    return points


def sum_days(days: list[date], rows: list[VideoStatsDaily]) -> list[DayPoint]:
    """Per day, totals across videos; the averages are weighted by views."""
    points: list[DayPoint] = []
    for day in days:
        todays = [row for row in rows if row.day == day]
        views = sum(row.views for row in todays)
        seconds = sum(row.avg_view_seconds * row.views for row in todays)
        percent = sum(row.avg_view_percent * row.views for row in todays)
        points.append(
            DayPoint(
                day=day,
                views=views,
                watch_minutes=sum(row.watch_minutes for row in todays),
                avg_view_seconds=round(seconds / views) if views else 0,
                avg_view_percent=round(percent / views, 1) if views else 0.0,
            )
        )
    return points


@router.get("/beats/{beat_id}/stats", response_model=list[DayPoint])
def beat_stats(beat_id: str, session: SessionDep, days: DaysQuery = 28) -> list[DayPoint]:
    """Daily points of one beat; empty when it is not on YouTube."""
    beat = load_beat(session, beat_id)
    if not beat.youtube_id:
        return []
    span = window(days)
    rows = StatsRepo(session).daily(beat.youtube_id, span[0], span[-1])
    return fill_days(span, rows)


@router.get("/stats/overview", response_model=OverviewOut)
def overview(session: SessionDep, days: DaysQuery = 28) -> OverviewOut:
    """Channel totals for the window and the per-day series behind them."""
    span = window(days)
    per_day = sum_days(span, StatsRepo(session).daily_all(span[0], span[-1]))
    return OverviewOut(
        views=sum(p.views for p in per_day),
        watch_minutes=sum(p.watch_minutes for p in per_day),
        per_day=per_day,
    )


@router.post("/stats/collect", response_model=JobOut)
def collect_now(queue: QueueDep) -> JobOut:
    """Run the STATS job now instead of waiting for the nightly hour."""
    return JobOut.model_validate(queue.enqueue(JobKind.STATS))
