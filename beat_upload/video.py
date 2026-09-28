"""Rendering a still-image video from an audio track with ffmpeg.

``render_video`` optionally reports progress: with ``on_progress`` ffmpeg runs with
``-progress pipe:1`` and every ``out_time_us`` line becomes a fraction of the audio duration
(from ``ffprobe``). Without it the behaviour is the plain blocking call the CLI has always used.
"""

import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path

from beat_upload.errors import VideoError

VIDEO_WIDTH = 1920
VIDEO_HEIGHT = 1080

# Every render gets the same 45 % sepia: the classic sepia matrix blended 45/55 with identity.
# The Draft preview mirrors it with CSS `filter: sepia(.45)`, which browsers compute the same way.
SEPIA_STRENGTH = 0.45
_SEPIA = ((0.393, 0.769, 0.189), (0.349, 0.686, 0.168), (0.272, 0.534, 0.131))

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


def sepia_filter(strength: float = SEPIA_STRENGTH) -> str:
    """Pure. ffmpeg ``colorchannelmixer`` for a sepia of ``strength`` (0 = untouched, 1 = full)."""
    rows = []
    for i, row in enumerate(_SEPIA):
        mixed = [
            (1 - strength) * (1.0 if i == j else 0.0) + strength * c for j, c in enumerate(row)
        ]
        rows.append(":".join(f"{c:.4f}" for c in mixed) + ":0")  # alpha input stays 0
    return "colorchannelmixer=" + ":".join(rows)


def render_video(
    audio: Path, image: Path, output: Path, on_progress: ProgressFn | None = None
) -> Path:
    """Loop ``image`` for the duration of ``audio`` and write an H.264/AAC mp4."""
    ensure_ffmpeg()

    filters = (
        f"scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,"
        f"pad={VIDEO_WIDTH}:{VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2,"
        f"{sepia_filter()}"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-loop", "1",
        "-i", str(image),
        "-i", str(audio),
        "-filter_complex", filters,
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
