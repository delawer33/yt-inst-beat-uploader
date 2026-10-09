"""Rendering a still-image video from an audio track with ffmpeg.

A Render is two ffmpeg runs. ``render_cover`` paints one frame: the cover scaled into
1920x1080, painted in its Cover Style, the Label stamped top right, letterboxed on black.
``render_video`` then loops that frame for the length of the audio. The Draft page's preview
is ``render_cover`` too, so it shows exactly what the video will.

``render_video`` optionally reports progress: with ``on_progress`` ffmpeg runs with
``-progress pipe:1`` and every ``out_time_us`` line becomes a fraction of the audio duration
(from ``ffprobe``). Without it the behaviour is the plain blocking call the CLI has always used.
"""

import hashlib
import shutil
import subprocess
import tempfile
from collections.abc import Callable
from functools import cache
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from beat_upload import label
from beat_upload.cover_style import DEFAULT_COVER_STYLE, CoverStyle, cover_style_graph
from beat_upload.errors import VideoError

VIDEO_WIDTH = 1920
VIDEO_HEIGHT = 1080

ProgressFn = Callable[[float], None]  # fraction 0..1

_MICROSECONDS = 1_000_000.0
_TIME_KEYS = frozenset({"out_time_us", "out_time_ms"})  # both are microseconds in ffmpeg


def ensure_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        raise VideoError("ffmpeg is not installed or not on PATH")


def probe_duration(audio: Path) -> float:
    """Length of ``audio`` in seconds, via ``ffprobe``."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        str(audio),
    ]  # fmt: skip
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise VideoError(f"ffprobe failed:\n{result.stderr.strip()}")
    try:
        return float(result.stdout.strip())
    except ValueError as e:
        raise VideoError(f"ffprobe returned no duration for {audio.name}") from e


def parse_ffmpeg_progress(line: str, duration: float) -> float | None:
    """Pure. ``out_time_us=30000000`` with ``duration`` 120 -> 0.25; anything else -> None.

    ffmpeg prints ``out_time_ms`` in microseconds too (historical name); both are accepted.
    """
    key, sep, value = line.strip().partition("=")
    if not sep or key not in _TIME_KEYS or duration <= 0:
        return None
    try:
        seconds = int(value) / _MICROSECONDS
    except ValueError:
        return None
    return max(0.0, min(1.0, seconds / duration))


def fit_in_frame(width: int, height: int) -> tuple[int, int]:
    """Pure. The cover's size scaled to fit 1920x1080 with its aspect kept, both even."""
    scale = min(VIDEO_WIDTH / width, VIDEO_HEIGHT / height)
    w = min(VIDEO_WIDTH, max(2, round(width * scale / 2) * 2))
    h = min(VIDEO_HEIGHT, max(2, round(height * scale / 2) * 2))
    return w, h


def cover_graph(style: CoverStyle, size: tuple[int, int], out_width: int = VIDEO_WIDTH) -> str:
    """Pure. Filter graph from ``[0:v]`` (the cover) and ``[1:v]`` (the Label) to ``[cover]``.

    The style and the Label go on the cover at its size in the frame, before the pad, so the
    black bars are neither painted nor stamped. ``out_width`` below 1920 scales the finished
    frame down, for previews: the look is computed at 1080p either way.
    """
    w, h = size
    _, margin = label.placement(w)
    graph = (
        f"[0:v]scale={w}:{h}:flags=lanczos,format=rgb24[fit];"
        f"{cover_style_graph(style, 'fit', 'styled', size)};"
        f"[styled][1:v]overlay=x=W-w-{margin}:y={margin}:format=rgb[marked];"
        f"[marked]pad={VIDEO_WIDTH}:{VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black"
    )
    if out_width != VIDEO_WIDTH:
        graph += f",scale={out_width}:-2:flags=lanczos"
    return graph + "[cover]"


@cache
def cover_fingerprint(style: CoverStyle) -> str:
    """Pure. Short hash of everything that decides how ``render_cover`` paints a cover in
    ``style``: the filter graph and the Label's words and geometry. Cached stills carry it in
    their name, so a change to either is never served from an old file."""
    recipe = repr(
        (cover_graph(style, (VIDEO_WIDTH, VIDEO_HEIGHT)), label.LINES, label.WIDTH_SHARE,
         label.MARGIN_SHARE, label.render_label(200).tobytes())
    )  # fmt: skip
    return hashlib.sha1(recipe.encode()).hexdigest()[:10]


# EXIF orientations that turn the picture a quarter: ffmpeg applies them when it decodes.
_QUARTER_TURNS = frozenset({5, 6, 7, 8})
_EXIF_ORIENTATION = 0x0112
# Below this the Label's letters have no room; such a cover is a sliver in the frame.
MIN_LABEL_WIDTH = 40


def image_size(image: Path) -> tuple[int, int]:
    """The cover's size as ffmpeg decodes it, so turned by its EXIF orientation."""
    try:
        with Image.open(image) as im:
            w, h = im.size
            turned = im.getexif().get(_EXIF_ORIENTATION) in _QUARTER_TURNS
            return (h, w) if turned else (w, h)
    except (OSError, UnidentifiedImageError) as e:
        raise VideoError(f"Cannot read the cover {image.name}: {e}") from e


def render_cover(
    image: Path,
    output: Path,
    style: CoverStyle = DEFAULT_COVER_STYLE,
    out_width: int = VIDEO_WIDTH,
) -> Path:
    """One frame: ``image`` painted in ``style`` with the Label, letterboxed in 16:9.

    The format follows ``output``'s suffix (``.png`` for the video, ``.jpg`` for previews).
    """
    ensure_ffmpeg()
    size = fit_in_frame(*image_size(image))
    label_width, _ = label.placement(size[0])
    if label_width < MIN_LABEL_WIDTH:
        w, h = size
        raise VideoError(
            f"The cover {image.name} is too narrow for the Label ({w}x{h} in the frame); "
            "use a cover no taller than four times its width."
        )
    with tempfile.TemporaryDirectory(prefix="label-", dir=output.parent) as tmp:
        label_png = Path(tmp) / "label.png"
        label.render_label(label_width).save(label_png)
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(image),
            "-i", str(label_png),
            "-filter_complex", cover_graph(style, size, out_width),
            "-map", "[cover]",
            "-frames:v", "1",
            "-update", "1",
            *(["-q:v", "3"] if output.suffix.lower() in {".jpg", ".jpeg"} else []),
            str(output),
        ]  # fmt: skip
        result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise VideoError(f"ffmpeg failed on the cover:\n{result.stderr.strip()}")
    return output


def render_video(
    audio: Path,
    image: Path,
    output: Path,
    on_progress: ProgressFn | None = None,
    style: CoverStyle = DEFAULT_COVER_STYLE,
) -> Path:
    """The cover in ``style`` (``render_cover``) looped for the duration of ``audio``, as an
    H.264/AAC mp4."""
    ensure_ffmpeg()
    with tempfile.TemporaryDirectory(prefix="render-", dir=output.parent) as tmp:
        cover = render_cover(image, Path(tmp) / "cover.png", style)
        return _loop(audio, cover, output, on_progress)


def _loop(audio: Path, cover: Path, output: Path, on_progress: ProgressFn | None) -> Path:
    cmd = [
        "ffmpeg",
        "-y",
        "-loop", "1",
        "-i", str(cover),
        "-i", str(audio),
        "-c:v", "libx264",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",  # moov atom first; YouTube otherwise flags nonStreamableMov
        "-shortest",
    ]  # fmt: skip

    if on_progress is None:
        result = subprocess.run([*cmd, str(output)], capture_output=True, text=True)
        if result.returncode != 0:
            raise VideoError(f"ffmpeg failed:\n{result.stderr.strip()}")
        return output

    duration = probe_duration(audio)
    with subprocess.Popen(
        [*cmd, "-loglevel", "error", "-progress", "pipe:1", "-nostats", str(output)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    ) as proc:
        assert proc.stdout is not None and proc.stderr is not None
        # stderr is tiny at loglevel error, so draining stdout first cannot block ffmpeg.
        for line in proc.stdout:
            fraction = parse_ffmpeg_progress(line, duration)
            if fraction is not None:
                on_progress(fraction)
        stderr = proc.stderr.read()
        returncode = proc.wait()
    if returncode != 0:
        raise VideoError(f"ffmpeg failed:\n{stderr.strip()}")
    return output
