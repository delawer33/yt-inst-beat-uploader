"""The Bounce Folder: where the owner exports a finished beat (CONTEXT.md, ADR 0007).

One untagged WAV, one tagged MP3, one cover image and optionally a ``stems`` folder. The
folder's name, or else the WAV's, carries the facts::

    Jungle_104bpm_Amin_calm-rhytmic-mysterious_guitar-808_smp

Everything before ``<n>bpm`` is dropped, then comes the key, then up to two groups joined
with ``-`` (the moods, then the instruments), then ``smp`` when foreign samples are used.
Nothing here copies or changes a file.
"""

import re
from dataclasses import dataclass
from pathlib import Path

from beat_upload.beat_folder import IMAGE_EXTENSIONS
from beat_upload.errors import BounceFolderError

STEMS_DIRNAME = "stems"
SAMPLES_MARK = "smp"

_BPM = re.compile(r"(?P<bpm>\d{2,3})bpm")
_KEY = re.compile(r"[A-G][#b]?(?:min|maj)")
_GROUP = re.compile(r"[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*")


@dataclass(frozen=True)
class BounceFacts:
    bpm: int
    key: str  # "Amin", "F#min", "Bbmaj"
    moods: tuple[str, ...] = ()  # as the owner wrote them
    instruments: tuple[str, ...] = ()
    samples: bool = False


@dataclass(frozen=True)
class BounceFolder:
    folder: Path
    master: Path  # the one .wav
    tagged: Path  # the one .mp3
    cover: Path  # the one image
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
        if bpm is None or _KEY.fullmatch(parts[i + 1]) is None:
            continue
        rest = parts[i + 2 :]
        samples = bool(rest) and rest[-1] == SAMPLES_MARK
        if samples:
            rest = rest[:-1]
        groups = [tuple(g.split("-")) for g in rest if _GROUP.fullmatch(g)][:2]
        groups += [()] * (2 - len(groups))
        return BounceFacts(
            bpm=int(bpm["bpm"]),
            key=parts[i + 1],
            moods=groups[0],
            instruments=groups[1],
            samples=samples,
        )
    return None


def read_bounce_folder(folder: Path) -> BounceFolder:
    """The files of ``folder`` by kind and the facts of its name. ``BounceFolderError`` names
    what is missing or doubled."""
    if not folder.exists():
        raise BounceFolderError(f"Folder does not exist: {folder}")
    if not folder.is_dir():
        raise BounceFolderError(f"Not a folder: {folder}")
    master = _single(folder, {".wav"}, "WAV")
    tagged = _single(folder, {".mp3"}, "MP3")
    cover = _single(folder, IMAGE_EXTENSIONS, "cover image")
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
        stems=stems if stems.is_dir() else None,
        facts=facts,
    )


def _single(folder: Path, extensions: set[str] | frozenset[str], kind: str) -> Path:
    found = sorted(f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in extensions)
    if not found:
        raise BounceFolderError(f"No {kind} in {folder}.")
    if len(found) > 1:
        names = ", ".join(f.name for f in found)
        raise BounceFolderError(f"More than one {kind} in {folder}: {names}.")
    return found[0]
