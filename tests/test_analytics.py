import pytest

from beat_upload.analytics import VideoAnalytics, parse_video_report


def _response(rows: list[list[object]]) -> dict[str, object]:
    return {
        "columnHeaders": [
            {"name": "video"},
            {"name": "views"},
            {"name": "estimatedMinutesWatched"},
            {"name": "averageViewDuration"},
            {"name": "averageViewPercentage"},
        ],
        "rows": rows,
    }


def test_parse_video_report() -> None:
    rows = [["abc", 120, 150, 75, 51.234], ["def", 3, 1, 20, 12.0]]
    assert parse_video_report(_response(rows)) == [
        VideoAnalytics("abc", 120, 150, 75, 51.2),
        VideoAnalytics("def", 3, 1, 20, 12.0),
    ]


def test_parse_video_report_without_rows() -> None:
    """The API omits ``rows`` entirely when there is no data in the range."""
    assert parse_video_report({"columnHeaders": [{"name": "video"}]}) == []
    assert parse_video_report({}) == []


def test_parse_video_report_to_dict() -> None:
    v = parse_video_report(_response([["abc", 1, 1, 1, 1.0]]))[0]
    assert v.to_dict() == {
        "id": "abc",
        "views": 1,
        "watch_minutes": 1,
        "avg_view_seconds": 1,
        "avg_view_percent": 1.0,
    }


def test_videos_transport_error_is_network_error(monkeypatch: pytest.MonkeyPatch) -> None:
    from datetime import date

    from beat_upload import analytics
    from beat_upload.errors import NetworkError

    class Offline:
        def reports(self) -> "Offline":
            return self

        def query(self, **kwargs: object) -> "Offline":
            return self

        def execute(self) -> None:
            raise TimeoutError("timed out")

    monkeypatch.setattr(analytics.googleapiclient.discovery, "build", lambda *a, **k: Offline())
    api = analytics.YouTubeAnalytics("creds")  # type: ignore[arg-type]
    with pytest.raises(NetworkError, match="Could not reach YouTube"):
        api.videos(date(2026, 9, 1), date(2026, 9, 1))
