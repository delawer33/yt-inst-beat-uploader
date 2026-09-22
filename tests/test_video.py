"""ffmpeg progress parsing and ``render_video`` with a fake ``subprocess``."""

import subprocess
from collections.abc import Iterator
from io import StringIO
from pathlib import Path

import pytest

from beat_upload import video
from beat_upload.errors import VideoError
from beat_upload.video import parse_ffmpeg_progress, probe_duration, render_video


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        ("out_time_us=30000000", 0.25),
        ("out_time_ms=60000000", 0.5),
        ("out_time_us=999000000", 1.0),  # clamped
        ("out_time_us=N/A", None),
        ("frame=12", None),
        ("progress=continue", None),
        ("", None),
    ],
)
def test_parse_ffmpeg_progress(line: str, expected: float | None) -> None:
    assert parse_ffmpeg_progress(line, 120.0) == expected


def test_parse_ffmpeg_progress_zero_duration_is_none() -> None:
    assert parse_ffmpeg_progress("out_time_us=5", 0.0) is None


class FakePopen:
    """Stands in for ``subprocess.Popen``: streams canned progress lines on stdout."""

    calls: list[list[str]] = []
    returncode = 0
    stderr_text = ""
    lines: list[str] = ["frame=1", "out_time_us=30000000", "out_time_us=120000000", "progress=end"]

    def __init__(self, cmd: list[str], **kwargs: object) -> None:
        FakePopen.calls.append(cmd)
        self.stdout: Iterator[str] = iter(line + "\n" for line in self.lines)
        self.stderr = StringIO(self.stderr_text)
        Path(cmd[-1]).write_bytes(b"mp4")

    def wait(self) -> int:
        return self.returncode

    def __enter__(self) -> "FakePopen":
        return self

    def __exit__(self, *exc: object) -> None:
        pass


@pytest.fixture
def fake_ffmpeg(monkeypatch: pytest.MonkeyPatch) -> type[FakePopen]:
    FakePopen.calls = []
    FakePopen.returncode = 0
    FakePopen.stderr_text = ""
    monkeypatch.setattr(video, "ensure_ffmpeg", lambda: None)
    monkeypatch.setattr(video, "probe_duration", lambda audio: 120.0)
    monkeypatch.setattr(subprocess, "Popen", FakePopen)
    return FakePopen


def test_render_video_reports_progress(tmp_path: Path, fake_ffmpeg: type[FakePopen]) -> None:
    seen: list[float] = []
    out = render_video(tmp_path / "a.mp3", tmp_path / "c.png", tmp_path / "video.mp4", seen.append)
    assert out == tmp_path / "video.mp4"
    assert seen == [0.25, 1.0]
    cmd = fake_ffmpeg.calls[0]
    assert "-progress" in cmd and "pipe:1" in cmd and "-nostats" in cmd


def test_render_video_progress_failure_keeps_stderr(
    tmp_path: Path, fake_ffmpeg: type[FakePopen]
) -> None:
    fake_ffmpeg.returncode = 1
    fake_ffmpeg.stderr_text = "Unknown encoder 'libx264'\n"
    with pytest.raises(VideoError, match="Unknown encoder"):
        render_video(tmp_path / "a.mp3", tmp_path / "c.png", tmp_path / "v.mp4", lambda f: None)


def test_render_video_without_callback_uses_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[list[str]] = []

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, "", "")

    monkeypatch.setattr(video, "ensure_ffmpeg", lambda: None)
    monkeypatch.setattr(subprocess, "run", fake_run)
    render_video(tmp_path / "a.mp3", tmp_path / "c.png", tmp_path / "v.mp4")
    assert len(calls) == 1
    assert "-progress" not in calls[0]


def test_probe_duration(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert cmd[0] == "ffprobe" and str(tmp_path / "a.mp3") in cmd
        return subprocess.CompletedProcess(cmd, 0, "181.123000\n", "")

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert probe_duration(tmp_path / "a.mp3") == pytest.approx(181.123)


def test_probe_duration_failure(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(cmd, 1, "", "No such file")

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(VideoError, match="ffprobe failed"):
        probe_duration(tmp_path / "a.mp3")
