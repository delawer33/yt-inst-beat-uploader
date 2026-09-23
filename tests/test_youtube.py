"""Chunked resumable upload: progress callbacks and the final id."""

from pathlib import Path

import pytest
from googleapiclient.errors import HttpError

from beat_upload import youtube
from beat_upload.config import PrivacyStatus, YouTubeMetadata
from beat_upload.errors import NetworkError, UploadError
from beat_upload.youtube import CHUNK_RETRIES, CHUNK_RETRY_DELAY, CHUNK_SIZE, upload_video


class FakeStatus:
    def __init__(self, fraction: float) -> None:
        self._fraction = fraction

    def progress(self) -> float:
        return self._fraction


class FakeRequest:
    def __init__(self, steps: list[tuple[object, object]]) -> None:
        self._steps = iter(steps)

    def next_chunk(self) -> tuple[object, object]:
        return next(self._steps)


class FakeYouTube:
    def __init__(self, request: FakeRequest) -> None:
        self.request = request
        self.calls: list[dict] = []

    def videos(self) -> "FakeYouTube":
        return self

    def insert(self, **kwargs: object) -> FakeRequest:
        self.calls.append(kwargs)
        return self.request


@pytest.fixture
def media(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    created: list[dict] = []

    def fake_media(path: str, **kwargs: object) -> str:
        created.append({"path": path, **kwargs})
        return "media"

    monkeypatch.setattr(youtube.googleapiclient.http, "MediaFileUpload", fake_media)
    return created


def build(monkeypatch: pytest.MonkeyPatch, steps: list[tuple[object, object]]) -> FakeYouTube:
    fake = FakeYouTube(FakeRequest(steps))
    monkeypatch.setattr(youtube.googleapiclient.discovery, "build", lambda *a, **k: fake)
    return fake


def test_upload_reports_progress_and_returns_id(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, media: list[dict]
) -> None:
    fake = build(
        monkeypatch, [(FakeStatus(0.4), None), (FakeStatus(0.8), None), (None, {"id": "vid42"})]
    )
    seen: list[float] = []
    meta = YouTubeMetadata(title="T", tags=["a"])

    assert upload_video(tmp_path / "v.mp4", meta, "creds", seen.append) == "vid42"  # type: ignore[arg-type]
    assert seen == [0.4, 0.8]
    assert media == [{"path": str(tmp_path / "v.mp4"), "chunksize": CHUNK_SIZE, "resumable": True}]
    body = fake.calls[0]["body"]
    assert body["snippet"]["title"] == "T" and body["status"]["privacyStatus"] == "private"


def test_upload_without_callback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, media: list[dict]
) -> None:
    build(monkeypatch, [(FakeStatus(0.5), None), (None, {"id": "vid1"})])
    assert upload_video(tmp_path / "v.mp4", YouTubeMetadata(title="T"), "creds") == "vid1"  # type: ignore[arg-type]


def test_upload_http_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, media: list[dict]
) -> None:
    class Boom(FakeRequest):
        def next_chunk(self) -> tuple[object, object]:
            raise HttpError(type("R", (), {"status": 403, "reason": "quota"})(), b"quota")

    fake = FakeYouTube(Boom([]))
    monkeypatch.setattr(youtube.googleapiclient.discovery, "build", lambda *a, **k: fake)
    with pytest.raises(UploadError, match="YouTube API error"):
        upload_video(tmp_path / "v.mp4", YouTubeMetadata(title="T"), "creds")  # type: ignore[arg-type]


class Flaky(FakeRequest):
    """``next_chunk`` raises ``failures`` transport errors before continuing the steps."""

    def __init__(self, steps: list[tuple[object, object]], failures: int) -> None:
        super().__init__(steps)
        self.failures = failures
        self.calls = 0

    def next_chunk(self) -> tuple[object, object]:
        self.calls += 1
        if self.failures:
            self.failures -= 1
            raise ConnectionResetError("connection reset by peer")
        return super().next_chunk()


def test_upload_retries_a_chunk_on_transport_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, media: list[dict]
) -> None:
    request = Flaky([(FakeStatus(0.5), None), (None, {"id": "yt1"})], failures=2)
    fake = FakeYouTube(request)
    monkeypatch.setattr(youtube.googleapiclient.discovery, "build", lambda *a, **k: fake)
    waits: list[float] = []

    video_id = upload_video(
        tmp_path / "v.mp4", YouTubeMetadata(title="T"), "creds", sleep=waits.append
    )  # type: ignore[arg-type]

    assert video_id == "yt1"
    assert request.calls == 4  # 2 failures, then the two real steps on the same session
    assert waits == [CHUNK_RETRY_DELAY, CHUNK_RETRY_DELAY * 2]


def test_upload_transport_error_is_network_error_after_chunk_retries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, media: list[dict]
) -> None:
    request = Flaky([], failures=CHUNK_RETRIES + 1)
    fake = FakeYouTube(request)
    monkeypatch.setattr(youtube.googleapiclient.discovery, "build", lambda *a, **k: fake)
    waits: list[float] = []
    with pytest.raises(NetworkError, match="Could not reach YouTube"):
        upload_video(tmp_path / "v.mp4", YouTubeMetadata(title="T"), "creds", sleep=waits.append)  # type: ignore[arg-type]
    assert request.calls == CHUNK_RETRIES + 1
    assert len(waits) == CHUNK_RETRIES


def test_upload_does_not_retry_local_file_errors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, media: list[dict]
) -> None:
    class Unplugged(FakeRequest):
        def next_chunk(self) -> tuple[object, object]:
            raise OSError(5, "Input/output error")

    fake = FakeYouTube(Unplugged([]))
    monkeypatch.setattr(youtube.googleapiclient.discovery, "build", lambda *a, **k: fake)
    with pytest.raises(OSError, match="Input/output error"):
        upload_video(tmp_path / "v.mp4", YouTubeMetadata(title="T"), "creds", sleep=lambda s: None)  # type: ignore[arg-type]


def test_set_privacy_transport_error_is_network_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class Offline:
        def videos(self) -> "Offline":
            return self

        def update(self, **kwargs: object) -> "Offline":
            return self

        def execute(self) -> None:
            raise TimeoutError("timed out")

    monkeypatch.setattr(youtube.googleapiclient.discovery, "build", lambda *a, **k: Offline())
    with pytest.raises(NetworkError, match="Could not reach YouTube"):
        youtube.set_privacy("v1", PrivacyStatus.UNLISTED, "creds")  # type: ignore[arg-type]
