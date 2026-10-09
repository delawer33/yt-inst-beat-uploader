"""ffmpeg progress parsing, the cover graph, and ``render_cover``/``render_video`` with a fake
``subprocess``."""

import subprocess
from collections.abc import Iterator
from io import StringIO
from pathlib import Path

import pytest
from PIL import Image

from beat_upload import label, video
from beat_upload.cover_style import CoverStyle
from beat_upload.errors import VideoError
from beat_upload.video import (
    cover_fingerprint,
    cover_graph,
    fit_in_frame,
    parse_ffmpeg_progress,
    probe_duration,
    render_cover,
    render_video,
)


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


def fake_render_cover(image: Path, output: Path, style: CoverStyle, *a: object) -> Path:
    fake_render_cover.styles.append(style)  # type: ignore[attr-defined]
    output.write_bytes(b"png")
    return output


@pytest.fixture
def fake_ffmpeg(monkeypatch: pytest.MonkeyPatch) -> type[FakePopen]:
    FakePopen.calls = []
    FakePopen.returncode = 0
    FakePopen.stderr_text = ""
    fake_render_cover.styles = []  # type: ignore[attr-defined]
    monkeypatch.setattr(video, "ensure_ffmpeg", lambda: None)
    monkeypatch.setattr(video, "render_cover", fake_render_cover)
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
    monkeypatch.setattr(video, "render_cover", fake_render_cover)
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


@pytest.mark.parametrize(
    ("size", "expected"),
    [
        ((3000, 3000), (1080, 1080)),  # square: pillarboxed
        ((1280, 720), (1920, 1080)),  # 16:9 fills the frame
        ((4000, 1000), (1920, 480)),  # wide: letterboxed
        ((1001, 1333), (812, 1080)),  # odd sizes come out even
    ],
)
def test_fit_in_frame(size: tuple[int, int], expected: tuple[int, int]) -> None:
    assert fit_in_frame(*size) == expected


def test_label_sits_on_the_cover_not_the_frame() -> None:
    assert label.placement(1080) == (292, 43)  # 27 % wide, 4 % margin of the cover


def test_cover_graph_styles_and_stamps_before_the_pad() -> None:
    g = cover_graph(CoverStyle.STONE_OCEAN, (1080, 1080))
    assert g.startswith("[0:v]scale=1080:1080")
    style = g.index("lutrgb=")
    stamp = g.index("[1:v]overlay=x=W-w-43:y=43")
    pad = g.index("pad=1920:1080")
    assert style < stamp < pad
    assert g.endswith("[cover]")
    assert ",scale=" not in g[pad:]  # full size for the video


def test_cover_graph_scales_down_after_the_pad_for_previews() -> None:
    g = cover_graph(CoverStyle.STONE_OCEAN, (1080, 1080), out_width=960)
    assert g.endswith("pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,scale=960:-2:flags=lanczos[cover]")


def test_render_cover_feeds_the_label_as_second_input(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cover = tmp_path / "cover.jpg"
    Image.new("RGB", (1000, 1000), "red").save(cover)
    seen: list[list[str]] = []

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        seen.append(cmd)
        label = Path(cmd[cmd.index("-i", cmd.index("-i") + 1) + 1])
        with Image.open(label) as im:
            assert im.width == 292  # 27 % of the cover's 1080 px in the frame
        return subprocess.CompletedProcess(cmd, 0, "", "")

    monkeypatch.setattr(video, "ensure_ffmpeg", lambda: None)
    monkeypatch.setattr(subprocess, "run", fake_run)
    render_cover(cover, tmp_path / "out.jpg", CoverStyle.BLOOD_3TONE, out_width=960)
    cmd = seen[0]
    assert "blood" not in cmd[cmd.index("-filter_complex") + 1]  # colours, not the name
    assert cmd[-1] == str(tmp_path / "out.jpg") and "-q:v" in cmd
    assert not list(tmp_path.glob("label-*"))  # the temp label is cleaned up


def test_render_cover_unreadable_image(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(video, "ensure_ffmpeg", lambda: None)
    bad = tmp_path / "c.png"
    bad.write_bytes(b"not an image")
    with pytest.raises(VideoError, match="Cannot read the cover c.png"):
        render_cover(bad, tmp_path / "out.png")


def test_render_video_loops_the_styled_cover(tmp_path: Path, fake_ffmpeg: type[FakePopen]) -> None:
    render_video(
        tmp_path / "a.mp3", tmp_path / "c.png", tmp_path / "v.mp4", lambda f: None,
        CoverStyle.DIO_GREEN,
    )  # fmt: skip
    assert fake_render_cover.styles == [CoverStyle.DIO_GREEN]  # type: ignore[attr-defined]
    cmd = fake_ffmpeg.calls[0]
    assert "-filter_complex" not in cmd  # the still is already finished
    assert cmd[cmd.index("-loop") + 3].endswith("cover.png")
    assert not list(tmp_path.glob("render-*"))


def test_cover_fingerprint_differs_per_style_and_is_stable() -> None:
    a = cover_fingerprint(CoverStyle.STONE_OCEAN)
    assert a == cover_fingerprint(CoverStyle.STONE_OCEAN)
    assert a != cover_fingerprint(CoverStyle.DIO_GREEN)
    assert len(a) == 10


def test_a_cover_turned_by_exif_is_sized_as_ffmpeg_decodes_it(tmp_path: Path) -> None:
    cover = tmp_path / "phone.jpg"
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees on display
    Image.new("RGB", (400, 200), "red").save(cover, exif=exif)
    assert video.image_size(cover) == (200, 400)


def test_a_sliver_of_a_cover_is_refused_with_a_reason(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(video, "ensure_ffmpeg", lambda: None)
    cover = tmp_path / "sliver.png"
    Image.new("RGB", (60, 4000), "red").save(cover)
    with pytest.raises(VideoError, match="too narrow for the Label"):
        render_cover(cover, tmp_path / "out.png")
