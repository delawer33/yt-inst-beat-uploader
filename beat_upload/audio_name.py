"""Facts an audio file name carries: ``Dmin110.mp3`` is a beat in D minor at 110 BPM.

Strict form only, ``<note>[#|b]<min|maj><bpm>``; any other name gives nothing, so a beat
named "Lasso" is never read as having a key.
"""

import re
from dataclasses import dataclass
from pathlib import PurePath

_FACTS = re.compile(r"(?P<key>[A-G][#b]?(?:min|maj))(?P<bpm>\d{2,3})")


@dataclass(frozen=True)
class AudioNameFacts:
    key: str  # as written: "Dmin", "C#min", "Fmaj"
    bpm: int

    @property
    def spelled_key(self) -> str:
        """The key the way a description says it: "D minor", "C# major"."""
        return self.key[:-3] + (" minor" if self.key.endswith("min") else " major")


def audio_name_facts(name: str) -> AudioNameFacts | None:
    """BPM and key from an audio file name (with or without its extension)."""
    match = _FACTS.fullmatch(PurePath(name).stem) if name else None
    if match is None:
        return None
    return AudioNameFacts(key=match["key"], bpm=int(match["bpm"]))
