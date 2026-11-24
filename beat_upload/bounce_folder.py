"""The Bounce Folder: where the owner exports a finished beat (CONTEXT.md, ADR 0007).

One untagged WAV, one tagged MP3, one cover image or one Clip (a muted video in its place)
and optionally a ``stems`` folder. The
folder's name, or else the WAV's, carries the facts::

    Jungle_104bpm_Amin_calm-rhytmic-mysterious_guitar-808_smp

Everything before ``<n>bpm`` (or a bare ``<n>`` right before the key) is dropped, then comes
the key, then up to two groups joined with ``-`` (the moods, then the instruments), then
``smp`` when foreign samples are used, optionally with where they come from:
``smp-looperman`` or ``smp_looperman`` (Splice when not given).
Nothing here copies or changes a file.
"""

import re
from dataclasses import dataclass
from pathlib import Path

from beat_upload.beat_folder import CLIP_EXTENSIONS, IMAGE_EXTENSIONS
from beat_upload.errors import BounceFolderError

STEMS_DIRNAME = "stems"
SAMPLES_MARK = "smp"
DEFAULT_SAMPLE_SOURCE = "Splice"
# How a source written in the name is spelled on BeatStars; others are title-cased.
SAMPLE_SOURCES = {"splice": "Splice", "looperman": "Looperman"}

_BPM = re.compile(r"(?P<bpm>\d{2,3})(?:bpm)?")
# "Amin", or "Amin-calm-dark" when a dash stands where the underscore after the key belongs.
# A key without min/maj ("D#") counts as minor.
_KEY = re.compile(r"(?P<note>[A-G][#b]?)(?P<mode>min|maj)?(?:-(?P<moods>.*))?")
_GROUP = re.compile(r"[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*")


@dataclass(frozen=True)
class BounceFacts:
    bpm: int
    key: str  # "Amin", "F#min", "Bbmaj"
    moods: tuple[str, ...] = ()  # as the owner wrote them
    instruments: tuple[str, ...] = ()
    samples: bool = False
    sample_source: str | None = None  # where the samples come from, when ``samples``


@dataclass(frozen=True)
class BounceFolder:
    folder: Path
    master: Path  # the one .wav
    tagged: Path  # the one .mp3
    cover: Path | None  # the one image, or None when a Clip stands in its place
    clip: Path | None  # the one video (CONTEXT.md: Clip); None with a cover image
    stems: Path | None
    facts: BounceFacts


def parse_bounce_name(name: str) -> BounceFacts | None:
    """Facts from a folder or file name (extension, if any, ignored by the caller).

    ``None`` when there is no ``<n>bpm_<key>`` in it. Groups after the key that do not fit
    the shape are ignored rather than failing: the BPM and key are what a Draft needs.
    """
    parts = name.split("_")
    for i, part in enumerate(parts[:-1]):
        bpm = _BPM.fullmatch(part)
        key = _KEY.fullmatch(parts[i + 1])
        if bpm is None or key is None:
            continue
        rest, source = _split_samples([key["moods"] or "", *parts[i + 2 :]])
        samples = source is not None
        rest = [g.strip("-") for g in rest]  # "_-inspiring-dreamy_": a stray dash
        groups = [tuple(g.split("-")) for g in rest if _GROUP.fullmatch(g)][:2]
        groups += [()] * (2 - len(groups))
        return BounceFacts(
            bpm=int(bpm["bpm"]),
            key=key["note"] + (key["mode"] or "min"),
            moods=groups[0],
            instruments=groups[1],
            samples=samples,
            sample_source=source,
        )
    return None


def _split_samples(rest: list[str]) -> tuple[list[str], str | None]:
    """``rest`` without its samples mark, and the samples' source (``None``: no samples).
    ``smp``, ``smp-looperman`` and ``smp_looperman`` are all understood."""
    if rest and rest[-1] == SAMPLES_MARK:
        return rest[:-1], DEFAULT_SAMPLE_SOURCE
    if rest and rest[-1].startswith(SAMPLES_MARK + "-"):
        return rest[:-1], _source(rest[-1][len(SAMPLES_MARK) + 1 :])
    if len(rest) >= 2 and rest[-2] == SAMPLES_MARK:
        return rest[:-2], _source(rest[-1])
    return rest, None


def _source(word: str) -> str:
    return SAMPLE_SOURCES.get(word.lower(), word.replace("-", " ").title())


def read_bounce_folder(folder: Path) -> BounceFolder:
    """The files of ``folder`` by kind and the facts of its name. ``BounceFolderError`` names
    what is missing or doubled."""
    if not folder.exists():
        raise BounceFolderError(f"Folder does not exist: {folder}")
    if not folder.is_dir():
        raise BounceFolderError(f"Not a folder: {folder}")
    master = _single(folder, {".wav"}, "WAV")
    tagged = _single(folder, {".mp3"}, "MP3")
    cover, clip = _visual(folder)
    facts = parse_bounce_name(folder.name) or parse_bounce_name(master.stem)
    if facts is None:
        raise BounceFolderError(
            f"No BPM and key in the name of {folder.name} or of {master.name}; "
            "expected something like 104bpm_Amin_calm-dark_guitar-808."
        )
    stems = folder / STEMS_DIRNAME
    return BounceFolder(
        folder=folder,
        master=master,
        tagged=tagged,
        cover=cover,
        clip=clip,
        stems=stems if stems.is_dir() else None,
        facts=facts,
    )


def _visual(folder: Path) -> tuple[Path | None, Path | None]:
    """The cover image or the Clip: exactly one of the two."""
    images = _all(folder, IMAGE_EXTENSIONS)
    clips = _all(folder, CLIP_EXTENSIONS)
    if len(images) + len(clips) > 1:
        names = ", ".join(f.name for f in images + clips)
        raise BounceFolderError(f"More than one cover image or clip in {folder}: {names}.")
    if not images and not clips:
        raise BounceFolderError(f"No cover image or clip in {folder}.")
    return (images[0], None) if images else (None, clips[0])


def _all(folder: Path, extensions: frozenset[str]) -> list[Path]:
    return sorted(f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in extensions)


def _single(folder: Path, extensions: set[str] | frozenset[str], kind: str) -> Path:
    found = sorted(f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in extensions)
    if not found:
        raise BounceFolderError(f"No {kind} in {folder}.")
    if len(found) > 1:
        names = ", ".join(f.name for f in found)
        raise BounceFolderError(f"More than one {kind} in {folder}: {names}.")
    return found[0]
