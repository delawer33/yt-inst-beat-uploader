"""Rendering a still-image video from an audio track with ffmpeg."""

import shutil
import subprocess
from pathlib import Path

from beat_upload.errors import VideoError

VIDEO_WIDTH = 1920
VIDEO_HEIGHT = 1080


def ensure_ffmpeg() -> None:
    if shutil.which("ffmpeg") is None:
        raise VideoError("ffmpeg is not installed or not on PATH")


def render_video(audio: Path, image: Path, output: Path) -> Path:
    """Loop ``image`` for the duration of ``audio`` and write an H.264/AAC mp4."""
    ensure_ffmpeg()

    scale_and_pad = (
        f"scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,"
        f"pad={VIDEO_WIDTH}:{VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2"
    )
    cmd = [
        "ffmpeg",
        "-y",
        "-loop", "1",
        "-i", str(image),
        "-i", str(audio),
        "-filter_complex", scale_and_pad,
        "-c:v", "libx264",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        "-shortest",
        str(output),
    ]  # fmt: skip

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise VideoError(f"ffmpeg failed:\n{result.stderr.strip()}")
    return output
