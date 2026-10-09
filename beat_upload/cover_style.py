"""Cover Style: the look a Render paints the cover in (CONTEXT.md).

A gradient map plus ink outlines, in the manner of JoJo's colour pages: the cover goes grey,
its brightness is cut into 3-5 bands, each band becomes one fixed colour, and edge lines are
multiplied on top. The colours come from the style, not from the cover, so any picture comes
out in the same series. Decided in ``docs/cover-styles-prd.md``.
"""

from dataclasses import dataclass
from enum import StrEnum

from beat_upload.errors import ConfigError


class CoverStyle(StrEnum):
    PURPLE_YELLOW_5TONE = "purple_yellow_5tone"
    PURPLE_YELLOW_THICK_INK = "purple_yellow_thick_ink"
    GOLDEN_WIND = "golden_wind"
    DIO_GREEN = "dio_green"
    DIAMOND_PINK_CYAN = "diamond_pink_cyan"
    STONE_OCEAN = "stone_ocean"
    BLOOD_3TONE = "blood_3tone"


DEFAULT_COVER_STYLE = CoverStyle.PURPLE_YELLOW_5TONE

# Applied to the grey cover before it is cut into bands; the cuts below are on its output.
CONTRAST = 1.3


@dataclass(frozen=True)
class _Look:
    colours: tuple[str, ...]  # hex, shadows to highlights
    cuts: tuple[int, ...]  # grey 0-255; below cuts[0] -> colours[0], and so on
    thick_ink: bool = False


_CUT4 = (60, 120, 190)
_LOOKS: dict[CoverStyle, _Look] = {
    CoverStyle.PURPLE_YELLOW_5TONE: _Look(
        ("1c0838", "6b1c9e", "e0287a", "ffc61a", "d8fbff"), (45, 95, 150, 205)
    ),
    CoverStyle.PURPLE_YELLOW_THICK_INK: _Look(
        ("230a46", "c81e8c", "ffcd28", "c8ffff"), _CUT4, thick_ink=True
    ),
    CoverStyle.GOLDEN_WIND: _Look(("1a0a2e", "b0153a", "f5c518", "fff6d5"), _CUT4),
    CoverStyle.DIO_GREEN: _Look(("0d2b1a", "6a1fa0", "c8e632", "fdfbd0"), _CUT4),
    CoverStyle.DIAMOND_PINK_CYAN: _Look(("14123a", "ff3d9a", "39d5e6", "ffffff"), _CUT4),
    CoverStyle.STONE_OCEAN: _Look(("06204a", "1a8f9e", "a6e22e", "f0fff0"), _CUT4),
    CoverStyle.BLOOD_3TONE: _Look(("0a0a0a", "c1121f", "ffe8c2"), (80, 170)),
}

# Edge lines, negated so they are dark on white and multiply onto the colours. The numbers
# come from the prototype, which ran on covers about 360 px tall; at 1080p the same detector
# finds only hair-thin noise, so the ink is found on a copy that small and scaled back up.
INK_HEIGHT = 360
_INK_THIN = "edgedetect=low=0.08:high=0.25,negate"
_INK_THICK = "edgedetect=low=0.06:high=0.2,negate,erosion"


def parse_cover_style(value: object) -> CoverStyle:
    """``None`` -> the default; a known name -> its style; anything else -> ``ConfigError``."""
    if value is None:
        return DEFAULT_COVER_STYLE
    try:
        return CoverStyle(str(value))
    except ValueError:
        names = ", ".join(CoverStyle)
        raise ConfigError(f"cover_style must be one of {names}; got {value!r}") from None


def gradient_map_filter(style: CoverStyle) -> str:
    """Pure. Grey -> contrast -> one fixed colour per brightness band, as a filter chain.

    Commas inside the ``lutrgb`` expressions are escaped for use inside a filter graph.
    """
    look = _LOOKS[style]
    rgb = [tuple(int(c[i : i + 2], 16) for i in (0, 2, 4)) for c in look.colours]

    def channel(k: int) -> str:
        expr = str(rgb[-1][k])
        for cut, colour in zip(reversed(look.cuts), reversed(rgb[:-1]), strict=True):
            expr = f"if(lt(val\\,{cut})\\,{colour[k]}\\,{expr})"
        return expr

    return (
        f"format=gray,eq=contrast={CONTRAST},format=rgb24,"
        f"lutrgb=r='{channel(0)}':g='{channel(1)}':b='{channel(2)}',format=gbrp"
    )


def ink_filter(style: CoverStyle) -> str:
    """Pure. Dark edge lines on white, as gbrp so the blend stays in colour."""
    return (_INK_THICK if _LOOKS[style].thick_ink else _INK_THIN) + ",format=gbrp"


def cover_style_graph(style: CoverStyle, src: str, dst: str, size: tuple[int, int]) -> str:
    """Pure. A filter-graph fragment that paints pad ``[src]``, ``size`` pixels, in ``style``
    into ``[dst]``.

    Both blend inputs are forced to gbrp: otherwise ffmpeg negotiates grey for the whole
    graph and the result comes out black and white.
    """
    return (
        f"[{src}]split[{dst}_map][{dst}_ink];"
        f"[{dst}_map]{gradient_map_filter(style)}[{dst}_colour];"
        f"[{dst}_ink]{_ink_at_prototype_scale(style, size)}[{dst}_line];"
        f"[{dst}_colour][{dst}_line]blend=all_mode=multiply,format=rgb24[{dst}]"
    )


def _ink_at_prototype_scale(style: CoverStyle, size: tuple[int, int]) -> str:
    w, h = size
    if h <= INK_HEIGHT:
        return ink_filter(style)
    small = f"scale=-2:{INK_HEIGHT}:flags=area"
    back = f"scale={w}:{h}:flags=bicubic"
    return f"{small},{ink_filter(style)},{back},format=gbrp"
