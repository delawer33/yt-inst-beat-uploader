"""Bakes and the header: pure parts only (no ffmpeg, no browser)."""

from pathlib import Path

import pytest

from beat_upload.errors import ConfigError
from beat_upload.visual import EFFECTS
from beat_upload.visual.bake import (
    BAKE_SECONDS,
    BAKED,
    STONES,
    bake,
    bake_file,
    bake_for,
    bake_status,
    stone_for,
    variant_for,
)
from beat_upload.visual.header import SIZES, header_lines, render_header
from beat_upload.visual.render import EffectMeta


def test_every_baked_effect_is_registered_and_the_gem_has_a_bake_per_stone() -> None:
    ids = {e.id for e in EFFECTS}
    assert set(BAKED) <= ids
    assert BAKED["gem"] == STONES and len(STONES) == 5
    assert BAKE_SECONDS == 24


def test_the_variant_follows_the_seed_and_the_file_is_named_after_it(tmp_path: Path) -> None:
    assert variant_for("chain", 12345) is None
    assert variant_for("gem", 0) == "ruby" and variant_for("gem", 7) == "sapphire"
    assert stone_for("gem", 7) == 2 and stone_for("chain", 7) is None  # gem.js STONES index
    assert stone_for("vjcut", 7) is None
    assert bake_file(tmp_path, "chain", None) == tmp_path / "chain.mp4"
    assert bake_file(tmp_path, "gem", "amber") == tmp_path / "gem-amber.mp4"


def test_bake_for_finds_the_file_of_the_beat_or_nothing(tmp_path: Path) -> None:
    assert bake_for(tmp_path, "vjcut", 1) is None  # not a baked Effect
    assert bake_for(tmp_path, "crown", 1) is None  # not baked yet
    (tmp_path / "crown.mp4").write_bytes(b"mp4")
    (tmp_path / "gem-sapphire.mp4").write_bytes(b"mp4")
    assert bake_for(tmp_path, "crown", 1) == tmp_path / "crown.mp4"
    assert bake_for(tmp_path, "gem", 7) == tmp_path / "gem-sapphire.mp4"
    assert bake_for(tmp_path, "gem", 0) is None  # the ruby is missing
    status = bake_status(tmp_path)
    assert status["crown"] == {None: True} and status["chain"] == {None: False}
    assert status["gem"]["sapphire"] and not status["gem"]["ruby"]


def test_bake_refuses_an_unknown_effect_or_variant(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="not a baked Effect"):
        bake("vjcut", None, tmp_path)
    with pytest.raises(ConfigError, match="no variant"):
        bake("gem", "opal", tmp_path)


def test_header_lines_spell_the_header_like_the_effects_do() -> None:
    meta = EffectMeta(title="Night Drive", artists="A x B", bpm=140, key="Fmin")
    assert header_lines(meta) == ("NIGHT DRIVE", "A X B TYPE BEAT", "140 BPM  ·  FMIN")
    assert header_lines(EffectMeta(title="Plain")) == ("PLAIN", "TYPE BEAT", "")


def test_render_header_is_a_transparent_frame_with_text_in_the_corners() -> None:
    meta = EffectMeta(title="Night Drive", artists="A x B", bpm=140, key="Fmin")
    image = render_header(meta, "reel")
    assert image.size == SIZES["reel"] and image.mode == "RGBA"
    alpha = image.getchannel("A")
    left, top, right, bottom = alpha.getbbox()
    assert top > 250 and bottom < 420  # around the title's baseline at 320
    assert left < 80 and right > 1000  # the title on the left, the facts on the right
    assert render_header(EffectMeta(), "yt").size == SIZES["yt"]
