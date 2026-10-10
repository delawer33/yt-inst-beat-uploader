"""The file names of a Track Package, the owner's way to hand over bpm, key and moods.

``NAME_95bpm_Cmin_dark-intense_smp_delawer_tagged.mp3`` splits on ``_`` into: the name
(no spaces, ``-`` stands for one), ``<n>bpm``, the key, optional moods joined with ``-``,
optional ``smp`` (foreign loops or samples), the producer tag ``delawer`` and an optional
suffix: none for the master WAV, ``tagged`` for the preview, ``stems`` for the zip.
"""

import re
from dataclasses import dataclass
from enum import StrEnum
from pathlib import PurePath

from beat_upload.errors import BeatStarsError

PRODUCER = "delawer"
SAMPLES_MARK = "smp"
MAX_MOODS = 5

_KEY = re.compile(r"(?P<note>[A-G])(?P<accidental>[#b]?)(?P<mode>min|maj)")
_SPELLED_KEY = re.compile(
    r"(?P<note>[A-G])\s*(?P<accidental>[#b]?)\s*(?P<mode>min|maj|minor|major|m)\b",
    re.IGNORECASE,
)
_BPM = re.compile(r"(?P<bpm>\d{2,3})bpm")
_MOODS = re.compile(r"[a-z]+(?:-[a-z]+)*")
_ACCIDENTAL_NAMES = {"": "", "#": "_SHARP", "b": "_FLAT"}


class TrackFileKind(StrEnum):
    MASTER = "master"  # untagged WAV
    PREVIEW = "tagged"  # tagged MP3, the preview and the free download
    STEMS = "stems"  # zip


_SUFFIXES = {
    "": TrackFileKind.MASTER,
    "tagged": TrackFileKind.PREVIEW,
    "stems": TrackFileKind.STEMS,
}
_EXTENSIONS = {
    TrackFileKind.MASTER: ".wav",
    TrackFileKind.PREVIEW: ".mp3",
    TrackFileKind.STEMS: ".zip",
}


@dataclass(frozen=True)
class TrackFileName:
    name: str  # as in the file: "QUIET-HAPPINESS"
    bpm: int
    key: str  # "Cmin", "F#min", "Bbmaj"
    moods: tuple[str, ...] = ()
    samples: bool = False

    @property
    def display_name(self) -> str:
        return self.name.replace("-", " ")

    def filename(self, kind: TrackFileKind) -> str:
        parts = [self.name, f"{self.bpm}bpm", self.key]
        if self.moods:
            parts.append("-".join(self.moods))
        if self.samples:
            parts.append(SAMPLES_MARK)
        parts.append(PRODUCER)
        if kind is not TrackFileKind.MASTER:
            parts.append(kind.value)
        return "_".join(parts) + _EXTENSIONS[kind]


def parse_track_filename(filename: str) -> tuple[TrackFileName, TrackFileKind]:
    """``NAME_95bpm_Cmin_dark-intense_delawer_tagged.mp3`` -> its facts and which file it is.

    The extension is not checked here: a tagged WAV the owner exported is still the preview
    source. Raises ``BeatStarsError`` naming the part that does not fit.
    """
    stem = PurePath(filename).stem
    parts = stem.split("_")
    suffix = ""
    if parts and parts[-1] in ("tagged", "stems"):
        suffix = parts.pop()
    if len(parts) < 4 or parts[-1] != PRODUCER:
        raise BeatStarsError(
            f"{filename}: expected NAME_<n>bpm_<key>[_moods][_smp]_{PRODUCER}[_tagged|_stems]"
        )
    name, bpm_part, key, *rest = parts[:-1]
    samples = bool(rest) and rest[-1] == SAMPLES_MARK
    if samples:
        rest.pop()
    if not name or " " in name:
        raise BeatStarsError(f"{filename}: the name must be non-empty and have no spaces")
    bpm = _BPM.fullmatch(bpm_part)
    if bpm is None:
        raise BeatStarsError(f"{filename}: '{bpm_part}' is not a tempo like 95bpm")
    if _KEY.fullmatch(key) is None:
        raise BeatStarsError(f"{filename}: '{key}' is not a key like Cmin, F#min or Bbmaj")
    moods: tuple[str, ...] = ()
    if rest:
        if len(rest) > 1 or _MOODS.fullmatch(rest[0]) is None:
            raise BeatStarsError(
                f"{filename}: moods go in one part, lower case, joined with '-' (dark-intense)"
            )
        moods = tuple(rest[0].split("-"))
        if len(moods) > MAX_MOODS:
            raise BeatStarsError(f"{filename}: at most {MAX_MOODS} moods")
    facts = TrackFileName(name, int(bpm["bpm"]), key, moods, samples)
    return facts, _SUFFIXES[suffix]


def file_safe_name(display_name: str) -> str:
    """'They Come And Go' -> 'They-Come-And-Go': the name part of a file name."""
    return re.sub(r"[^A-Za-z0-9]+", "-", display_name).strip("-")


def normalize_key(text: str) -> str | None:
    """'F# minor', 'A#min', 'D minor', 'Cmin' -> 'F#min', 'A#min', 'Dmin', 'Cmin'."""
    match = _SPELLED_KEY.search(text)
    if match is None:
        return None
    mode = "maj" if match["mode"].lower() in ("maj", "major") else "min"
    return f"{match['note'].upper()}{match['accidental']}{mode}"


def spelled_key(key: str) -> str:
    """'F#min' -> 'F# minor'."""
    return key[:-3] + (" minor" if key.endswith("min") else " major")


def beatstars_key(key: str) -> str:
    """'F#min' -> 'F_SHARP_MINOR', 'Bbmaj' -> 'B_FLAT_MAJOR': the value of Studio's Key select."""
    match = _KEY.fullmatch(key)
    if match is None:
        raise BeatStarsError(f"'{key}' is not a key like Cmin, F#min or Bbmaj")
    mode = "_MINOR" if match["mode"] == "min" else "_MAJOR"
    return match["note"] + _ACCIDENTAL_NAMES[match["accidental"]] + mode
