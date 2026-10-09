"""The Label: the channel's own mark in the layout of the Parental Advisory label (CONTEXT.md).

A black box with three lines of equal width: a small top line with wide letter spacing, a big
word on a white band, a bottom line. Heights are shares of the label width, measured from a
real label; each line's caps keep their shape and the leftover width becomes equal gaps
between letters, which is why this is drawn with Pillow and not with ffmpeg ``drawtext``.
"""

from functools import cache
from importlib.resources import files

from PIL import Image, ImageDraw, ImageFont

LINES = ("PRODUCED BY", "DELAWER", "YOU BETTER RUN")

# Placement on the cover, as shares of the cover's width.
WIDTH_SHARE = 0.27
MARGIN_SHARE = 0.04

_HEIGHTS = (0.095, 0.24, 0.13)  # top, big, bottom line; shares of the label width
_GAPS = (0.055, 0.047)
_PAD = 0.07  # the black box around the lines
_BAND = 0.06  # how much taller than its word the white band is
_MIN_GAP = 0.04  # of the line height; below that the caps are squeezed
_SPACE = 0.3  # a word space, as a share of the line height, on top of the gaps around it
_GLYPH_SIZE = 400  # glyphs are drawn this big once, then scaled down

_WHITE = (255, 255, 255, 255)
_BLACK = (0, 0, 0, 255)


@cache
def _font() -> ImageFont.FreeTypeFont:
    path = files("beat_upload") / "fonts" / "LeagueGothic-Regular.ttf"
    return ImageFont.truetype(str(path), _GLYPH_SIZE)


@cache
def _glyph(ch: str) -> Image.Image:
    """The cap ``ch`` as an alpha mask cropped to its ink."""
    font = _font()
    left, top, right, bottom = font.getbbox(ch)
    mask = Image.new("L", (right - left + 4, bottom - top + 4), 0)
    ImageDraw.Draw(mask).text((2 - left, 2 - top), ch, font=font, fill=255)
    return mask


def _line(text: str, width: int, height: int, colour: tuple[int, int, int, int]) -> Image.Image:
    """``text`` in caps ``height`` tall, spread over ``width``: the leftover width becomes
    equal gaps between every two characters, and a space is a fixed word gap on top, so the
    words of a tightly set line still read apart."""
    caps = [None if c == " " else _glyph(c) for c in text]
    cap_height = max(g.height for g in caps if g is not None)
    scale = height / cap_height
    space = round(_SPACE * height)
    squash = 1.0
    for _ in range(20):
        widths = [space if g is None else max(1, round(g.width * scale * squash)) for g in caps]
        gap = (width - sum(widths)) / max(1, len(text) - 1)
        if gap >= _MIN_GAP * height:
            break
        squash *= 0.93
    out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    x = 0.0
    for g, w in zip(caps, widths, strict=True):
        if g is None:
            x += w + gap
            continue
        mask = g.resize((w, height), Image.Resampling.LANCZOS)
        out.paste(Image.new("RGBA", (w, height), colour), (round(x), 0), mask)
        x += w + gap
    return out


def placement(cover_width: int) -> tuple[int, int]:
    """Pure. (label width, margin) in pixels on a cover this wide in the frame."""
    return round(cover_width * WIDTH_SHARE), round(cover_width * MARGIN_SHARE)


def render_label(width: int) -> Image.Image:
    """Pure. The boxed Label ``width`` pixels wide, RGBA, black and white."""
    top, big, bottom = _HEIGHTS
    height = round(width * (sum(_HEIGHTS) + sum(_GAPS) + 2 * _PAD + _BAND))
    label = Image.new("RGBA", (width, height), _BLACK)
    inner = round(width * (1 - 2 * _PAD))
    x0 = round(width * _PAD)
    y = width * _PAD

    label.alpha_composite(_line(LINES[0], inner, round(width * top), _WHITE), (x0, round(y)))
    y += width * (top + _GAPS[0])

    band = Image.new("RGBA", (inner, round(width * (big + _BAND))), _WHITE)
    word = _line(LINES[1], inner - round(width * _BAND), round(width * big), _BLACK)
    band.alpha_composite(word, (round(width * _BAND / 2), round(width * _BAND / 2)))
    label.alpha_composite(band, (x0, round(y - width * 0.015)))
    y += width * (big + _BAND + _GAPS[1])

    label.alpha_composite(_line(LINES[2], inner, round(width * bottom), _WHITE), (x0, round(y)))
    return label
