"""Cover Style: the seven looks and the ffmpeg graph that paints one. Pure, no ffmpeg."""

import pytest

from beat_upload.cover_style import (
    DEFAULT_COVER_STYLE,
    CoverStyle,
    cover_style_graph,
    gradient_map_filter,
    parse_cover_style,
)
from beat_upload.errors import ConfigError


def test_there_are_seven_and_the_default_is_purple_yellow() -> None:
    assert len(CoverStyle) == 7
    assert DEFAULT_COVER_STYLE is CoverStyle.PURPLE_YELLOW_5TONE


def test_gradient_map_paints_each_band_one_colour() -> None:
    # blood_3tone: 0a0a0a below 80, c1121f below 170, ffe8c2 above.
    f = gradient_map_filter(CoverStyle.BLOOD_3TONE)
    assert f.startswith("format=gray,eq=contrast=1.3,format=rgb24,lutrgb=")
    assert "r='if(lt(val\\,80)\\,10\\,if(lt(val\\,170)\\,193\\,255))'" in f
    assert "g='if(lt(val\\,80)\\,10\\,if(lt(val\\,170)\\,18\\,232))'" in f
    assert "b='if(lt(val\\,80)\\,10\\,if(lt(val\\,170)\\,31\\,194))'" in f
    assert f.endswith("format=gbrp")


@pytest.mark.parametrize("style", list(CoverStyle))
def test_every_style_has_one_cut_less_than_colours(style: CoverStyle) -> None:
    f = gradient_map_filter(style)
    r = f.split("r='")[1].split("'")[0]
    assert r.count("if(lt(val") >= 2


def test_graph_multiplies_ink_over_the_colours_both_as_gbrp() -> None:
    g = cover_style_graph(CoverStyle.GOLDEN_WIND, "in", "out", (300, 300))
    assert g.startswith("[in]split")
    assert "edgedetect=" in g and "negate" in g
    assert "blend=all_mode=multiply" in g
    assert g.endswith("[out]")
    assert "erosion" not in g  # thin ink


def test_thick_ink_is_eroded() -> None:
    assert "erosion" in cover_style_graph(CoverStyle.PURPLE_YELLOW_THICK_INK, "a", "b", (300, 300))


def test_parse_cover_style() -> None:
    assert parse_cover_style("stone_ocean") is CoverStyle.STONE_OCEAN
    assert parse_cover_style(None) is DEFAULT_COVER_STYLE
    with pytest.raises(ConfigError, match="cover_style must be one of .*blood_3tone"):
        parse_cover_style("sepia")
