"""The header an Effect paints into the frame (title, artists, BPM, key), drawn with Pillow.

The object Effects draw it in JavaScript (``tiny()`` in ``effects/*.js``: IBM Plex Mono
SemiBold, letter-spaced, top left and top right). A Reel played from a bake (``bake.py``) has
no header in its frames, so this draws the same lines, in the same places, as a transparent
PNG that ffmpeg lays over the loop. The numbers are the Lab pixels of ``tiny()`` times the
Render's scale of 2.
"""

from importlib.resources import files
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from beat_upload.visual.render import EffectMeta, Format

FONT = Path(str(files("beat_upload") / "fonts" / "IBMPlexMono-SemiBold.ttf"))
SCALE = 2  # the Render draws at twice the Lab's pixels
SIZES: dict[Format, tuple[int, int]] = {"reel": (1080, 1920), "yt": (1920, 1080)}
MARGIN = 28 * SCALE
TOP: dict[Format, int] = {"reel": 160 * SCALE, "yt": 44 * SCALE}  # the title's baseline
TITLE_PX, LINE_PX, LINE_GAP = 12 * SCALE, 10 * SCALE, 20 * SCALE
SPACING = 2.5 * SCALE  # extra pixels between letters
WHITE = (255, 255, 255, 255)
MUTED = (255, 255, 255, 140)  # rgba(255,255,255,0.55)


def header_lines(meta: EffectMeta) -> tuple[str, str, str]:
    """Pure. (title, artists line, facts) as ``tiny()`` spells them: upper case, ``TYPE
    BEAT`` after the artists (alone without them), ``140 BPM  ·  FMIN`` on the right."""
    artists = f"{meta.artists.upper()} TYPE BEAT" if meta.artists else "TYPE BEAT"
    facts = "  ·  ".join(
        part for part in (f"{meta.bpm} BPM" if meta.bpm else "", meta.key.upper()) if part
    )
    return meta.title.upper(), artists, facts


def render_header(meta: EffectMeta, fmt: Format) -> Image.Image:
    """The header as a transparent RGBA image the size of the frame."""
    width, height = SIZES[fmt]
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    title, artists, facts = header_lines(meta)
    y = TOP[fmt]
    _spaced(draw, title, MARGIN, y, TITLE_PX, WHITE)
    _spaced(draw, artists, MARGIN, y + LINE_GAP, LINE_PX, MUTED)
    if facts:
        x = width - MARGIN - _spaced_width(draw, facts, TITLE_PX)
        _spaced(draw, facts, x, y, TITLE_PX, WHITE)
    return image


def _font(px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT), px)


def _spaced_width(draw: ImageDraw.ImageDraw, text: str, px: int) -> float:
    font = _font(px)
    return sum(draw.textlength(ch, font=font) for ch in text) + SPACING * max(0, len(text) - 1)


def _spaced(
    draw: ImageDraw.ImageDraw, text: str, x: float, y: int, px: int, colour: tuple[int, ...]
) -> None:
    """Letter-spaced text with its baseline at ``y``, like ``canvas.letterSpacing``."""
    font = _font(px)
    for ch in text:
        draw.text((x, y), ch, font=font, fill=colour, anchor="ls")
        x += draw.textlength(ch, font=font) + SPACING
