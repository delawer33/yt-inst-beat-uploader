"""Read-only channel and video data from the YouTube Data API v3.

Everything here returns plain dataclasses so the CLI can print either a table or JSON.
The API responses are parsed by pure functions (``parse_*``) that tests exercise offline.
"""

import re
from dataclasses import asdict, dataclass
from typing import Any

import googleapiclient.discovery
from google.oauth2.credentials import Credentials
from googleapiclient.errors import HttpError

from beat_upload.errors import TRANSPORT_ERRORS, NetworkError, UploadError

PAGE_SIZE = 50  # API maximum for playlistItems.list and videos.list


@dataclass(frozen=True)
class ChannelStats:
    id: str
    title: str
    subscribers: int
    views: int
    videos: int
    uploads_playlist: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class VideoStats:
    id: str
    title: str
    published_at: str
    privacy: str
    duration_seconds: int
    views: int
    likes: int
    comments: int
    tags: list[str]
    description: str
    publish_at: str = ""  # status.publishAt: set only while the video is scheduled

    @property
    def url(self) -> str:
        return f"https://youtu.be/{self.id}"

    def to_dict(self) -> dict[str, Any]:
        return {**asdict(self), "url": self.url}


class YouTubeStats:
    """Thin wrapper over the Data API client. One instance per credentials."""

    def __init__(self, credentials: Credentials) -> None:
        try:
            self._api = googleapiclient.discovery.build("youtube", "v3", credentials=credentials)
        except TRANSPORT_ERRORS as e:
            raise NetworkError(f"Could not reach YouTube: {e}") from e

    def channel(self) -> ChannelStats:
        response = self._call(
            self._api.channels().list(part="snippet,statistics,contentDetails", mine=True)
        )
        items = response.get("items") or []
        if not items:
            raise UploadError("No YouTube channel is linked to this Google account")
        return parse_channel(items[0])

    def videos(self, limit: int | None = None) -> list[VideoStats]:
        """Uploads of the authenticated channel, newest first. ``None`` means all."""
        playlist = self.channel().uploads_playlist
        ids = self._upload_ids(playlist, limit)
        return [v for chunk in _chunks(ids, PAGE_SIZE) for v in self._videos_by_id(chunk)]

    def video(self, video_id: str) -> VideoStats:
        found = self._videos_by_id([video_id])
        if not found:
            raise UploadError(f"Video not found or not accessible: {video_id}")
        return found[0]

    def _upload_ids(self, playlist: str, limit: int | None) -> list[str]:
        ids: list[str] = []
        page_token: str | None = None
        while limit is None or len(ids) < limit:
            response = self._call(
                self._api.playlistItems().list(
                    part="contentDetails",
                    playlistId=playlist,
                    maxResults=PAGE_SIZE,
                    pageToken=page_token,
                )
            )
            ids += [item["contentDetails"]["videoId"] for item in response.get("items", [])]
            page_token = response.get("nextPageToken")
            if not page_token:
                break
        return ids[:limit] if limit is not None else ids

    def _videos_by_id(self, ids: list[str]) -> list[VideoStats]:
        if not ids:
            return []
        response = self._call(
            self._api.videos().list(
                part="snippet,statistics,status,contentDetails", id=",".join(ids)
            )
        )
        return [parse_video(item) for item in response.get("items", [])]

    @staticmethod
    def _call(request: Any) -> dict[str, Any]:
        try:
            return request.execute()
        except HttpError as e:
            raise UploadError(f"YouTube API error: {e}") from e
        except TRANSPORT_ERRORS as e:
            raise NetworkError(f"Could not reach YouTube: {e}") from e


def parse_channel(item: dict[str, Any]) -> ChannelStats:
    stats = item.get("statistics", {})
    return ChannelStats(
        id=item["id"],
        title=item["snippet"]["title"],
        subscribers=_int(stats.get("subscriberCount")),
        views=_int(stats.get("viewCount")),
        videos=_int(stats.get("videoCount")),
        uploads_playlist=item["contentDetails"]["relatedPlaylists"]["uploads"],
    )


def parse_video(item: dict[str, Any]) -> VideoStats:
    snippet = item.get("snippet", {})
    stats = item.get("statistics", {})
    status = item.get("status", {})
    return VideoStats(
        id=item["id"],
        title=snippet.get("title", ""),
        published_at=snippet.get("publishedAt", ""),
        privacy=status.get("privacyStatus", ""),
        duration_seconds=parse_duration(item.get("contentDetails", {}).get("duration", "")),
        views=_int(stats.get("viewCount")),
        likes=_int(stats.get("likeCount")),
        comments=_int(stats.get("commentCount")),
        tags=list(snippet.get("tags") or []),
        description=snippet.get("description", ""),
        publish_at=status.get("publishAt", ""),
    )


_DURATION = re.compile(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$")


def parse_duration(iso: str) -> int:
    """``PT3M25S`` -> 205. Unknown or empty input -> 0."""
    m = _DURATION.match(iso or "")
    if not m:
        return 0
    hours, minutes, seconds = (int(g) if g else 0 for g in m.groups())
    return hours * 3600 + minutes * 60 + seconds


def _int(value: Any) -> int:
    """Statistics arrive as strings and are absent when hidden (e.g. likes disabled)."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _chunks(items: list[str], size: int) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]
