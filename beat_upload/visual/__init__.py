"""Effects: how a Render moves the frame to the beat (CONTEXT.md, ADR 0011).

The registry below is what the app offers. ``STILL`` is the ffmpeg-only look every video had
before Effects; every other Effect is painted by the engine in ``engine.js`` with one file per
Effect in ``effects/`` and rendered by ``render.py``. Adding an Effect: drop its file into
``effects/`` and add one ``Effect`` line here.
"""

from dataclasses import dataclass
from importlib.resources import files
from pathlib import Path

from beat_upload.errors import ConfigError

STILL = "still"
DEFAULT_EFFECT = STILL


@dataclass(frozen=True)
class Effect:
    id: str
    name: str
    blurb: str


EFFECTS: tuple[Effect, ...] = (
    Effect(STILL, "Still", "The cover in its Cover Style, standing for the whole beat."),
    # The Instagram Effects, in the Visual Lab's order: light and ray-traced objects over black,
    # no cover, the header in tiny mono type. Steady light and camera: nothing pulses to the
    # beat except the particles. Chain, crown and gem play from bakes (``bake.py``) when the
    # data dir has them; the rest render through the engine.
    Effect(
        "burst",
        "Burst",
        "A pillar of light in the dark with a blinding core; streams of particles pour up and "
        "down along it with fading trails. The kick flares the core and throws a ring of "
        "particles, the snare widens the beam. No cover.",
    ),
    Effect(
        "chain",
        "Chain",
        "Six steel links ray-marched in a shader, interlocked, hanging through the frame and "
        "swinging in cold haze under slatted studio light; the links reflect each other, "
        "dented and scuffed. No cover.",
    ),
    Effect(
        "crown",
        "Crown",
        "An imperial gold crown ray-marched in a shader: an engraved band with beads, eight "
        "fleur-de-lis with pearls, rubies in bezels, four arches meeting at an orb and cross, "
        "a velvet cap inside. Soft studio shadows, turning slowly over black. No cover.",
    ),
    Effect(
        "dagger",
        "Dagger",
        "A dagger ray-marched in a shader: a brushed steel blade with a fuller, a gold "
        "crossguard with curled quillons, a leather grip wrapped in gold wire, a gold pommel. "
        "Turning slowly in grey smoke over black; the kick throws sparks from the point. "
        "No cover.",
    ),
    Effect(
        "doubloon",
        "Doubloon",
        "A worn gold pirate coin ray-marched in a shader, a raised cross and a ring of beads "
        "on its face, spinning on its edge under studio light over black. No cover.",
    ),
    Effect(
        "flow",
        "Flow",
        "Smoke of four hundred particles carried by a curl-noise field, leaving silky fading "
        "trails. The kick is a gust and a burst of new particles, the snare turns the field "
        "around. Two colours on near-black, new ones for every beat. No cover.",
    ),
    Effect(
        "gem",
        "Gem",
        "A brilliant cut ray-traced in a shader: real refraction through the facets with inner "
        "reflections, dispersion splitting the light into colours, Fresnel glints of a dark "
        "studio, bloom on top. Turning slowly in dust; ruby, diamond, sapphire, emerald or "
        "amber for every beat. No cover.",
    ),
    # The cover and the title, treated: a camera feed, kinetic type, a particle sign.
    Effect(
        "cctv",
        "CCTV",
        "The cover as a surveillance feed: desaturated, scanlines, a timecode and a REC dot. "
        "A detection box jumps over the picture on the kick, the snare tears the signal for a "
        "frame, every bar another camera and another zoom.",
    ),
    Effect(
        "kinetic",
        "Kinetic Type",
        "The title in lines across the whole frame, sliding left and right in tempo; every "
        "other line cut out of the cover, the rest outlined. Filled lines flash acid on the "
        "kick. Black, one colour.",
    ),
    Effect(
        "sigil",
        "Sigil",
        "A glowing sign of thousands of trembling particles over black, rays from its lines. "
        "It turns slowly and breathes; the kick flashes it white and blows the rays out, the "
        "snare throws sparks. No cover; its own shape and colour for every beat.",
    ),
    # The cuts over the cover; VJ Cut rapid first.
    Effect(
        "vj_rapid",
        "VJ Cut · rapid",
        "The five treatments at full strength, switched three to four times as often as "
        "random and less evenly: holds of 0.12-0.55 s, a new crop on every switch, now and "
        "then a burst of three or four switches in half a second.",
    ),
    Effect(
        "vjcut",
        "VJ Cut",
        "One cover, five live treatments: ASCII, Riso, Plates, Type Screen and the plain "
        "Cover Style, each laid over the picture at half strength so it stays readable. Every "
        "hit jumps to the next one.",
    ),
    Effect(
        "vj_hard",
        "VJ Cut · hard",
        "The same cycle at full strength: the treatment replaces the picture. The first VJ Cut.",
    ),
    Effect(
        "vj_random",
        "VJ Cut · random",
        "The five treatments at full strength, switched at random moments instead of on the "
        "beat, never the same twice in a row. No negative.",
    ),
    Effect(
        "vj_alt",
        "VJ Cut · alternate",
        "The plain picture (a new crop) on every other cut, a treatment at 70 % in between.",
    ),
    Effect(
        "vj_flash",
        "VJ Cut · flash",
        "The picture as the base; every cut flashes the next treatment and fades it out in half "
        "a second while the crop changes.",
    ),
    Effect(
        "vj_bar",
        "VJ Cut · bar accent",
        "The picture with a new crop on every cut; a full-strength treatment only on the first "
        "cut of each bar.",
    ),
)

_BY_ID = {e.id: e for e in EFFECTS}


def effect(effect_id: str) -> Effect:
    """The Effect with ``effect_id``; an unknown one -> ``ConfigError`` naming the choices."""
    try:
        return _BY_ID[effect_id]
    except KeyError:
        raise ConfigError(f"Unknown effect {effect_id!r}; one of {', '.join(_BY_ID)}") from None


def is_effect(effect_id: str | None) -> bool:
    return effect_id in _BY_ID


def visual_dir() -> Path:
    """The engine, the pages and the effects as installed."""
    return Path(str(files("beat_upload") / "visual"))


def effect_files() -> list[Path]:
    """Every effect file, in load order (alphabetical; an Effect that draws through another
    looks it up at draw time, so the order does not matter to the engine)."""
    return sorted((visual_dir() / "effects").glob("*.js"))
