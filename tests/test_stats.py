import httplib2
import pytest

from beat_upload.errors import NetworkError
from beat_upload.stats import (
    ChannelStats,
    YouTubeStats,
    parse_channel,
    parse_duration,
    parse_video,
)


@pytest.mark.parametrize(
    ("iso", "seconds"),
    [("PT3M25S", 205), ("PT1H2M3S", 3723), ("PT45S", 45), ("PT2M", 120), ("", 0), ("junk", 0)],
)
def test_parse_duration(iso: str, seconds: int) -> None:
    assert parse_duration(iso) == seconds


def test_parse_channel() -> None:
    item = {
        "id": "UC123",
        "snippet": {"title": "DELAWER"},
        "statistics": {"subscriberCount": "12", "viewCount": "3400", "videoCount": "7"},
        "contentDetails": {"relatedPlaylists": {"uploads": "UU123"}},
    }
    assert parse_channel(item) == ChannelStats(
        id="UC123", title="DELAWER", subscribers=12, views=3400, videos=7, uploads_playlist="UU123"
    )


def test_parse_video_full() -> None:
    item = {
        "id": "abc",
        "snippet": {
            "title": "Villain",
            "publishedAt": "2026-02-22T10:00:00Z",
            "tags": ["typebeat"],
            "description": "prod",
        },
        "statistics": {"viewCount": "100", "likeCount": "5", "commentCount": "1"},
        "status": {"privacyStatus": "public"},
        "contentDetails": {"duration": "PT2M30S"},
    }
    v = parse_video(item)
    assert (v.title, v.views, v.likes, v.comments) == ("Villain", 100, 5, 1)
    assert v.duration_seconds == 150
    assert v.privacy == "public"
    assert v.publish_at == ""
    assert v.url == "https://youtu.be/abc"
    assert v.to_dict()["url"] == v.url


def test_parse_video_missing_counts_default_to_zero() -> None:
    v = parse_video({"id": "x", "snippet": {}, "statistics": {}})
    assert (v.views, v.likes, v.comments, v.duration_seconds, v.tags) == (0, 0, 0, 0, [])
    assert v.publish_at == ""


def test_parse_video_scheduled_carries_publish_at() -> None:
    item = {
        "id": "abc",
        "snippet": {"title": "Villain"},
        "status": {"privacyStatus": "private", "publishAt": "2026-10-01T18:00:00Z"},
    }
    v = parse_video(item)
    assert (v.privacy, v.publish_at) == ("private", "2026-10-01T18:00:00Z")
    assert v.to_dict()["publish_at"] == "2026-10-01T18:00:00Z"


class _Failing:
    def __init__(self, exc: Exception) -> None:
        self._exc = exc

    def execute(self) -> dict[str, object]:
        raise self._exc


@pytest.mark.parametrize(
    "exc", [httplib2.ServerNotFoundError("Unable to find the server"), ConnectionRefusedError()]
)
def test_call_wraps_transport_errors(exc: Exception) -> None:
    with pytest.raises(NetworkError, match="Could not reach YouTube"):
        YouTubeStats._call(_Failing(exc))
