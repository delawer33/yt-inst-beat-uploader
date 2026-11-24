"""The Effect registry, the audio analysis on synthetic signals, and the render plan.

No ffmpeg, no browser: ``features_of`` takes samples, ``RenderPlan`` is data.
"""

import numpy as np
import pytest

from beat_upload.cover_style import CoverStyle
from beat_upload.errors import ConfigError, VideoError
from beat_upload.visual import EFFECTS, STILL, effect, effect_files, is_effect, visual_dir
from beat_upload.visual.analysis import (
    SAMPLE_RATE,
    beat_clock,
    features_of,
    onsets,
)
from beat_upload.visual.render import (
    EffectMeta,
    RenderPlan,
    clip_command,
    encode_command,
    frame_bytes,
    seed_for,
    split_jpegs,
)

# --- registry ------------------------------------------------------------------------------


def test_still_is_first_and_every_effect_has_a_file_or_is_still() -> None:
    assert EFFECTS[0].id == STILL
    names = {f.stem for f in effect_files()}
    for e in EFFECTS:
        assert e.id == STILL or e.id in names, e.id


def test_unknown_effect_names_the_choices() -> None:
    with pytest.raises(ConfigError, match="still, burst, chain, crown"):
        effect("wipe")
    assert is_effect("vjcut") and not is_effect(None) and not is_effect("wipe")


def test_the_engine_and_the_pages_ship() -> None:
    for name in ("engine.js", "render.html", "lab.html"):
        assert (visual_dir() / name).is_file()


# --- analysis ------------------------------------------------------------------------------


def _clicks(duration: float, bpm: int, sr: int = SAMPLE_RATE) -> np.ndarray:
    """A kick-like thump (decaying 60 Hz sine) on every beat, silence between."""
    t = np.arange(int(duration * sr)) / sr
    out = np.zeros_like(t, dtype=np.float32)
    period = 60 / bpm
    for k in range(int(duration / period)):
        start = int(k * period * sr)
        n = min(int(0.08 * sr), len(out) - start)
        tt = np.arange(n) / sr
        thump = np.sin(2 * np.pi * 60 * tt) * np.exp(-tt * 40)
        out[start : start + n] += thump.astype(np.float32)
    return out


def test_features_find_the_kicks_of_a_click_track() -> None:
    bpm, duration = 120, 4.0
    feats = features_of(_clicks(duration, bpm), fps=30, bpm=bpm)
    assert len(feats.frames) == 120
    kicks, _, _ = feats.hits
    assert 6 <= kicks <= 8  # eight beats; the first may hide in the silence reference
    # a hit lands within a frame of a beat
    for i, f in enumerate(feats.frames):
        if f["kickHit"]:
            assert abs((i / 30) % 0.5) < 0.07 or abs((i / 30) % 0.5 - 0.5) < 0.07
    # the beat clock follows the BPM
    assert feats.frames[60]["beats"] == pytest.approx(4.0)
    assert feats.frames[60]["phase"] == pytest.approx(0.0)
    assert feats.frames[60]["beatHit"] is True
    assert feats.frames[61]["beatHit"] is False


def test_silence_has_no_hits_and_no_clock_without_bpm() -> None:
    feats = features_of(np.zeros(SAMPLE_RATE, dtype=np.float32), fps=30, bpm=None)
    assert feats.hits == (0, 0, 0)
    assert feats.duration == pytest.approx(1.0)
    assert all(f["beats"] == 0 and not f["beatHit"] for f in feats.frames)
    assert len(feats.frames[0]["spec"]) == 64 and len(feats.frames[0]["bands"]) == 6


def test_onsets_respect_the_refractory_time() -> None:
    values = np.zeros(30, dtype=np.float32)
    values[[5, 6, 20]] = 100  # 6 is one frame after 5: inside 0.14 s at 30 fps
    hits = onsets(values, fps=30, mult=1.6, refractory=0.14)
    assert list(np.flatnonzero(hits)) == [5, 20]


def test_beat_clock() -> None:
    beats, phase, bar = beat_clock(1.0, 120)
    assert (beats, phase, bar) == (2.0, 0.0, 0.5)
    assert beat_clock(1.0, None) == (0.0, 0.0, 0.0)


# --- render plan ---------------------------------------------------------------------------


def test_plan_setup_carries_everything_the_page_needs() -> None:
    meta = EffectMeta("Night", "A x B", 140, "Fmin")
    plan = RenderPlan("vjcut", CoverStyle.DIO_GREEN, "yt", meta)
    setup = plan.setup("data:image/png;base64,AAAA")
    assert setup["effect"] == "vjcut" and setup["palette"] == "dio_green"
    assert setup["format"] == "yt" and setup["scale"] == 2  # the engine draws 1080p straight
    assert setup["meta"] == {"title": "Night", "artists": "A x B", "bpm": 140, "key": "Fmin"}
    assert setup["cover"].startswith("data:image/png")
    assert setup["clip"] is False and plan.setup("data:image/png;base64,AAAA", True)["clip"]


def test_seed_is_stable_and_32_bit() -> None:
    assert seed_for("beat-1") == seed_for("beat-1") != seed_for("beat-2")
    assert 0 <= seed_for("x") < 2**32


def test_encode_command_reads_jpegs_from_stdin(tmp_path) -> None:  # noqa: ANN001
    cmd = encode_command(tmp_path / "a.mp3", tmp_path / "v.mp4", 30)
    assert cmd[:2] == ["ffmpeg", "-y"]
    assert "image2pipe" in cmd and "-" in cmd and "+faststart" in cmd
    assert cmd[-1] == str(tmp_path / "v.mp4")


def test_frame_bytes_decodes_the_data_url() -> None:
    assert frame_bytes("data:image/jpeg;base64,/9j/4A==") == b"\xff\xd8\xff\xe0"
    with pytest.raises(VideoError):
        frame_bytes("data:image/png;base64,AAAA")


def test_clip_command_loops_mutes_and_sizes_the_clip(tmp_path) -> None:  # noqa: ANN001
    cmd = clip_command(tmp_path / "c.mp4", 30)
    assert cmd[cmd.index("-stream_loop") + 1] == "-1" and "-an" in cmd
    assert cmd[cmd.index("-r") + 1] == "30" and "960" in cmd[cmd.index("-vf") + 1]
    assert cmd[-1] == "-" and "mjpeg" in cmd


def test_split_jpegs_cuts_the_stream_at_every_end_mark() -> None:
    a, b = b"\xff\xd8AA\xff\x00\xff\xd9", b"\xff\xd8BBB\xff\xd9"
    stream = a + b + b"\xff\xd8tail"
    chunks = [stream[i : i + 3] for i in range(0, len(stream), 3)]
    assert list(split_jpegs(iter(chunks))) == [a, b]


def test_effect_meta_of_title_reads_the_youtube_shape_or_takes_the_words() -> None:
    meta = EffectMeta.of_title(
        '[FREE] Juice WRLD x Lil Peep Type Beat 2026 - "Night" | Emo', 140, "Fmin"
    )
    assert (meta.title, meta.artists, meta.bpm, meta.key) == (
        "Night",
        "Juice WRLD x Lil Peep",
        140,
        "Fmin",
    )
    meta = EffectMeta.of_title("Dark Night", None, None)
    assert (meta.title, meta.artists, meta.bpm, meta.key) == ("Dark Night", "", None, "")
    assert EffectMeta.of_title(None, None, None).title == ""
