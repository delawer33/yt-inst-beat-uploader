"""What the BeatStars track form asks for, and how a YouTube upload fills it.

``beatstars.json`` in a Track Package is a ``BeatStarsTrack``. ``track_from_youtube`` builds
one from a YouTube title of the form ``[FREE] A Type Beat x B Type Beat 2026 - "NAME" | Genre``:

- title ``NAME | A x B Type Beat`` (one artist when two do not fit in 60 characters);
- description: the YouTube title, ``BPM: 95 | Key: C minor``, the free-use line, the video;
- tags: ``<artist> type beat`` per artist, then the genre in lower case, then
  ``delawer type beat`` when there was only one artist;
- genres ``Trap`` + ``Hip Hop``, plus ``R&B`` or ``Drill`` when the genre says so;
- moods from the genre (``moods_for_genre``) unless the file name gave some.
"""

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from beat_upload.beatstars.naming import MAX_MOODS, PRODUCER, spelled_key
from beat_upload.errors import BeatStarsError

TRACK_FILENAME = "beatstars.json"

MAX_TITLE_LENGTH = 60
MAX_DESCRIPTION_LENGTH = 500
MAX_TAGS = 3
MAX_TAG_LENGTH = 25  # the Studio tag field's maxlength
MAX_GENRES = 3
DEFAULT_GENRES = ("Trap", "Hip Hop")
FREE_USE_LINE = 'Free for non-profit with credit "prod. delawer". License for release above.'

_YOUTUBE_TITLE = re.compile(
    r"^\[FREE\]\s*(?P<artists>.+?)\s+\d{4}\s*-\s*\"(?P<name>[^\"]+)\"\s*\|\s*(?P<genre>.+)$"
)
_TYPE_BEAT = re.compile(r"\s+type\s+beat$", re.IGNORECASE)
# A genre in the title's tail that adds a BeatStars genre to Trap + Hip Hop.
_EXTRA_GENRES = {"rnb": "R&B", "r&b": "R&B", "drill": "Drill"}
# Moods (from the BeatStars list) for a word in the title's genre, first match wins. Studio's
# "Autofill metadata" is not available for new tracks, so this is the starting point the owner
# corrects by ear.
_GENRE_MOODS = (
    ("rnb", ("Romantic", "Seductive", "Chill")),
    ("r&b", ("Romantic", "Seductive", "Chill")),
    ("drill", ("Dark", "Angry", "Intense")),
    ("guitar", ("Sad", "Melancholy", "Dreamy")),
    ("melodic", ("Sad", "Melancholy", "Dreamy")),
    ("soul", ("Soulful", "Mellow", "Warm")),
    ("club", ("Energetic", "Dancy", "Bouncy")),
    ("dark", ("Dark", "Evil", "Mysterious")),
    ("hard", ("Energetic", "Intense", "Angry")),
)
DEFAULT_MOODS = ("Energetic", "Confident", "Bold")


@dataclass(frozen=True)
class BeatStarsTrack:
    title: str
    bpm: int
    key: str  # "Cmin", "F#min"
    description: str = ""
    tags: list[str] = field(default_factory=list)
    genres: list[str] = field(default_factory=lambda: list(DEFAULT_GENRES))
    moods: list[str] = field(default_factory=list)  # as BeatStars lists them: "Dark"
    samples: bool = False  # "Loops and Samples"
    youtube_id: str | None = None

    def __post_init__(self) -> None:
        if not self.title.strip():
            raise BeatStarsError("title cannot be empty")
        if len(self.title) > MAX_TITLE_LENGTH:
            raise BeatStarsError(f"title must be <= {MAX_TITLE_LENGTH} characters: {self.title}")
        if len(self.description) > MAX_DESCRIPTION_LENGTH:
            raise BeatStarsError(f"description must be <= {MAX_DESCRIPTION_LENGTH} characters")
        if len(self.tags) > MAX_TAGS:
            raise BeatStarsError(f"at most {MAX_TAGS} tags: {self.tags}")
        if any(not 2 <= len(t) <= MAX_TAG_LENGTH for t in self.tags):
            raise BeatStarsError(f"tags must be 2 to {MAX_TAG_LENGTH} characters: {self.tags}")
        if not 1 <= len(self.genres) <= MAX_GENRES:
            raise BeatStarsError(f"1 to {MAX_GENRES} genres: {self.genres}")
        if len(self.moods) > MAX_MOODS:
            raise BeatStarsError(f"at most {MAX_MOODS} moods: {self.moods}")
        if not 20 <= self.bpm <= 300:
            raise BeatStarsError(f"bpm out of range: {self.bpm}")

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "BeatStarsTrack":
        try:
            return cls(**data)
        except TypeError as e:
            raise BeatStarsError(f"{TRACK_FILENAME}: {e}") from e


def write_track(track: BeatStarsTrack, folder: Path) -> Path:
    path = folder / TRACK_FILENAME
    path.write_text(json.dumps(track.to_dict(), ensure_ascii=False, indent=2) + "\n", "utf-8")
    return path


def read_track(folder: Path) -> BeatStarsTrack:
    path = folder / TRACK_FILENAME
    if not path.is_file():
        raise BeatStarsError(f"{TRACK_FILENAME} not found in {folder}")
    try:
        data = json.loads(path.read_text("utf-8"))
    except json.JSONDecodeError as e:
        raise BeatStarsError(f"Cannot parse {path}: {e}") from e
    if not isinstance(data, dict):
        raise BeatStarsError(f"{path} must contain an object")
    return BeatStarsTrack.from_dict(data)


@dataclass(frozen=True)
class YouTubeTitle:
    artists: list[str]  # "Yeat", "Playboi Carti"
    name: str  # "Naughty"
    genre: str  # "Hard Trap"


def parse_youtube_title(title: str) -> YouTubeTitle:
    match = _YOUTUBE_TITLE.match(title.strip())
    if match is None:
        raise BeatStarsError(f'Not a [FREE] A Type Beat 2026 - "NAME" | Genre title: {title}')
    artists = [_TYPE_BEAT.sub("", a).strip() for a in match["artists"].split(" x ")]
    return YouTubeTitle(artists=artists, name=match["name"].strip(), genre=match["genre"].strip())


def track_from_youtube(
    youtube_title: str,
    bpm: int,
    key: str,
    youtube_id: str | None = None,
    moods: list[str] | None = None,
    samples: bool = False,
) -> BeatStarsTrack:
    parsed = parse_youtube_title(youtube_title)
    return BeatStarsTrack(
        title=_title(parsed),
        bpm=bpm,
        key=key,
        description=_description(youtube_title, bpm, key, youtube_id),
        tags=_tags(parsed),
        genres=_genres(parsed.genre),
        moods=list(moods) if moods else moods_for_genre(parsed.genre),
        samples=samples,
        youtube_id=youtube_id,
    )


def _title(parsed: YouTubeTitle) -> str:
    title = f"{parsed.name} | {' x '.join(parsed.artists)} Type Beat"
    if len(title) > MAX_TITLE_LENGTH:
        title = f"{parsed.name} | {parsed.artists[0]} Type Beat"
    return title


def _description(youtube_title: str, bpm: int, key: str, youtube_id: str | None) -> str:
    lines = [youtube_title, f"BPM: {bpm} | Key: {spelled_key(key)}", FREE_USE_LINE]
    if youtube_id:
        lines.append(f"https://youtu.be/{youtube_id}")
    return "\n".join(lines)


def _tags(parsed: YouTubeTitle) -> list[str]:
    tags = [f"{a.lower()} type beat" for a in parsed.artists[:2]]
    tags.append(_main_genre(parsed.genre))
    if len(tags) < MAX_TAGS:
        tags.append(f"{PRODUCER} type beat")
    return tags


def _main_genre(genre: str) -> str:
    """'Chicago Drill x Hard Trap' -> 'chicago drill', 'Dark Trap / Boom Bap' -> 'dark trap'."""
    return re.split(r"\s+x\s+|\s*/\s*", genre, maxsplit=1)[0].strip().lower()


def moods_for_genre(genre: str) -> list[str]:
    """'Melodic Guitar Trap' -> ['Sad', 'Melancholy', 'Dreamy']."""
    words = re.findall(r"[a-z&]+", genre.lower())
    for word, moods in _GENRE_MOODS:
        if word in words:
            return list(moods)
    return list(DEFAULT_MOODS)


def mood_name(mood: str) -> str:
    """A file-name mood ('dark') as BeatStars lists it ('Dark')."""
    return mood.capitalize()


def _genres(genre: str) -> list[str]:
    genres = list(DEFAULT_GENRES)
    for word in re.findall(r"[a-z&]+", genre.lower()):
        extra = _EXTRA_GENRES.get(word)
        if extra and extra not in genres:
            genres.append(extra)
    return genres[:MAX_GENRES]
