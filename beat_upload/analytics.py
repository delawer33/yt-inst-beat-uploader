"""Per-video watch-time metrics from the YouTube Analytics API v2.

The Data API (``stats.py``) only knows lifetime views. This module answers the
questions that decide whether a beat is working: how long people actually watch
(average view duration) and what share of the video that is (average view
percentage). ``parse_video_report`` is pure so tests can run offline.
"""

from dataclasses import asdict, dataclass
from datetime import date
from typing import Any

import googleapiclient.discovery
from google.oauth2.credentials import Credentials
from googleapiclient.errors import HttpError

from beat_upload.errors import TRANSPORT_ERRORS, AnalyticsError, NetworkError

METRICS = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage"
MAX_RESULTS = 200  # API maximum when grouping by video


@dataclass(frozen=True)
class VideoAnalytics:
    id: str
    views: int
    watch_minutes: int
    avg_view_seconds: int
    avg_view_percent: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class YouTubeAnalytics:
    """Thin wrapper over the Analytics API client. One instance per credentials."""

    def __init__(self, credentials: Credentials) -> None:
        try:
            self._api = googleapiclient.discovery.build(
                "youtubeAnalytics", "v2", credentials=credentials
            )
        except TRANSPORT_ERRORS as e:
            raise NetworkError(f"Could not reach YouTube: {e}") from e

    def videos(self, start: date, end: date) -> list[VideoAnalytics]:
        """Metrics per video for the inclusive date range, most viewed first.

        Videos with no views in the range are not returned by the API.
        """
        if start > end:
            raise AnalyticsError(f"Start date {start} is after end date {end}")
        request = self._api.reports().query(
            ids="channel==MINE",
            startDate=start.isoformat(),
            endDate=end.isoformat(),
            metrics=METRICS,
            dimensions="video",
            sort="-views",
            maxResults=MAX_RESULTS,
        )
        try:
            response = request.execute()
        except HttpError as e:
            raise AnalyticsError(f"YouTube Analytics API error: {e}") from e
        except TRANSPORT_ERRORS as e:
            raise NetworkError(f"Could not reach YouTube: {e}") from e
        return parse_video_report(response)


def parse_video_report(response: dict[str, Any]) -> list[VideoAnalytics]:
    """Turn the API's ``columnHeaders`` + ``rows`` table into dataclasses."""
    headers = [h["name"] for h in response.get("columnHeaders", [])]
    result: list[VideoAnalytics] = []
    for row in response.get("rows") or []:
        cells = dict(zip(headers, row, strict=False))
        result.append(
            VideoAnalytics(
                id=str(cells.get("video", "")),
                views=int(cells.get("views") or 0),
                watch_minutes=int(cells.get("estimatedMinutesWatched") or 0),
                avg_view_seconds=int(cells.get("averageViewDuration") or 0),
                avg_view_percent=round(float(cells.get("averageViewPercentage") or 0.0), 1),
            )
        )
    return result
