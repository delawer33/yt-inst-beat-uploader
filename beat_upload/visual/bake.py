"""Bakes: the object Effects as looping clips, so a Reel with one is ffmpeg work again.

The crown, the chain and the gem turn in steady light and do not react to the beat, so their
frames do not depend on the beat at all. Each is drawn once, at full quality (2x2
supersampling, some 20 minutes), as a ``BAKE_SECONDS`` loop over black without the header,
with every motion made periodic over the loop (``window.__bake`` in the Effect's file), and
kept in the data dir (``Workspace.bakes_dir``). A Reel then is the loop repeated for the
whole beat with the header (``header.py``) laid on top and the audio: a minute of ffmpeg
instead of half an hour of Chromium. The gem is always the diamond in the Render (one bake;
the Lab still draws lots among its five stones).

An Effect that is not baked yet renders through the engine as before.
"""

import subprocess
import tempfile
import wave
from collections.abc import Callable
from pathlib import Path

import numpy as np

from beat_upload.cover_style import DEFAULT_COVER_STYLE
from beat_upload.errors import ConfigError, VideoError
from beat_upload.video import RENDER_CPUS, ProgressFn, _encode, ensure_ffmpeg
from beat_upload.visual.analysis import SAMPLE_RATE, analyse
from beat_upload.visual.header import render_header
from beat_upload.visual.render import EffectMeta, RenderPlan, _render_frames, ensure_chromium

BAKE_SECONDS = 24  # the loop; every rate in a baked Effect is a multiple of 2*pi/24
STONES = ("ruby", "diamond", "sapphire", "emerald", "amber")  # gem.js STONES, in order
DIAMOND = STONES.index("diamond")  # the one stone the Render uses
# Effect id -> its variants (None: just the one). Only Effects that stand still to the beat
# can be baked; these three do.
BAKED: dict[str, tuple[str | None, ...]] = {
    "chain": (None,),
    "crown": (None,),
    "gem": (None,),
}


def variant_for(effect: str, seed: int) -> str | None:
    """Pure. The variant a Beat with ``seed`` gets; None while every baked Effect has one."""
    variants = BAKED[effect]
    return variants[seed % len(variants)] if variants != (None,) else None


def stone_for(effect: str, seed: int) -> int | None:
    """Pure. The gem's stone as an index into ``gem.js`` STONES for a Render (always the
    diamond, like the bake); None for any other Effect."""
    return DIAMOND if effect == "gem" else None


def bake_file(bakes_dir: Path, effect: str, variant: str | None) -> Path:
    return bakes_dir / (f"{effect}-{variant}.mp4" if variant else f"{effect}.mp4")


def bake_for(bakes_dir: Path, effect: str, seed: int) -> Path | None:
    """The bake a Reel of ``effect`` with ``seed`` plays, when it exists; else None."""
    if effect not in BAKED:
        return None
    file = bake_file(bakes_dir, effect, variant_for(effect, seed))
    return file if file.is_file() else None


def bake_status(bakes_dir: Path) -> dict[str, dict[str | None, bool]]:
    """Every bakeable Effect, every variant, whether its file is there."""
    return {
        effect: {v: bake_file(bakes_dir, effect, v).is_file() for v in variants}
        for effect, variants in BAKED.items()
    }


def bake(
    effect: str,
    variant: str | None,
    bakes_dir: Path,
    on_progress: ProgressFn | None = None,
    on_status: Callable[[str], None] | None = None,
) -> Path:
    """Draw the ``BAKE_SECONDS`` loop of ``effect`` (``variant``) into ``bakes_dir``, at full
    quality, Reel format. Written next to the target and moved over it when whole."""
    if effect not in BAKED:
        raise ConfigError(f"{effect!r} is not a baked Effect; one of {', '.join(BAKED)}")
    if variant not in BAKED[effect]:
        raise ConfigError(f"{effect} has no variant {variant!r}; one of {BAKED[effect]}")
    ensure_ffmpeg()
    ensure_chromium(on_status)
    bakes_dir.mkdir(parents=True, exist_ok=True)
    target = bake_file(bakes_dir, effect, variant)
    part = target.with_name(f"{target.stem}.part{target.suffix}")
    options = {"stone": DIAMOND} if effect == "gem" else {}
    plan = RenderPlan(effect, DEFAULT_COVER_STYLE, "reel", EffectMeta(), seed=7, bake=options)
    try:
        with tempfile.TemporaryDirectory(prefix="bake-", dir=bakes_dir) as tmp:
            silence = Path(tmp) / "silence.wav"
            _write_silence(silence, BAKE_SECONDS)
            cover = Path(tmp) / "cover.png"
            _write_black(cover)
            if on_status:
                on_status(f"Baking {target.name}: {BAKE_SECONDS} s at full quality")
            features = analyse(silence, plan.fps, None)
            features.frames = features.frames[: BAKE_SECONDS * plan.fps]
            _render_frames(silence, cover, part, plan, features, on_progress)
        frames = _frame_count(part)
        if frames != BAKE_SECONDS * plan.fps:
            raise VideoError(
                f"The bake {target.name} came out with {frames} frames, not "
                f"{BAKE_SECONDS * plan.fps}; the encoder was cut short (a suspend?). Run it again."
            )
        part.replace(target)
    finally:
        part.unlink(missing_ok=True)
    return target


def _frame_count(clip: Path) -> int:
    """The video frames in ``clip`` as ffprobe counts them; 0 for a file without a video
    stream (an mp4 whose trailer was never written)."""
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-count_frames",
            "-show_entries",
            "stream=nb_read_frames",
            "-of",
            "csv=p=0",
            str(clip),
        ],  # fmt: skip
        capture_output=True,
        text=True,
    )
    try:
        return int(result.stdout.strip().rstrip(","))
    except ValueError:
        return 0


def render_from_bake(
    audio: Path,
    bake_clip: Path,
    meta: EffectMeta,
    output: Path,
    on_progress: ProgressFn | None = None,
) -> Path:
    """The Reel: ``bake_clip`` looped for the whole of ``audio`` under the header of ``meta``,
    encoded like the Still Reel (H.264/AAC, faststart)."""
    ensure_ffmpeg()
    if not bake_clip.is_file():
        raise VideoError(f"The bake {bake_clip} is missing; run `beat-upload bake`.")
    with tempfile.TemporaryDirectory(prefix="reel-", dir=output.parent) as tmp:
        header = Path(tmp) / "header.png"
        render_header(meta, "reel").save(header)
        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-an", "-i", str(bake_clip),
            "-i", str(audio),
            "-i", str(header),
            "-filter_complex", "[0:v][2:v]overlay=0:0:format=auto[v]",
            "-map", "[v]", "-map", "1:a",
            "-c:v", "libx264", "-threads", str(RENDER_CPUS), "-crf", "18", "-preset", "fast",
            "-c:a", "aac",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-shortest",
        ]  # fmt: skip
        return _encode(cmd, audio, output, on_progress)


def _write_silence(path: Path, seconds: int) -> None:
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(np.zeros(seconds * SAMPLE_RATE, dtype="<i2").tobytes())


def _write_black(path: Path) -> None:
    from PIL import Image

    Image.new("RGB", (1080, 1080), "black").save(path)
