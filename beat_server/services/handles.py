"""Artist Handles (CONTEXT.md): the Instagram account of each artist a title names.

One Setting, ``artist_handles``: a JSON object, artist name (stored lower case, so matching
is case-insensitive) -> handle without ``@``, or ``None`` for a name the owner marked a style
("Guitar", "Reggaeton"). A name missing from the map is *unknown*: the Instagram panel asks.
The caption's handle line is built from the map at display time, never by the model.
"""

import json
import re

from beat_server.db.repo import SettingsRepo
from beat_upload.beatstars.track import parse_youtube_title
from beat_upload.errors import BeatStarsError, ConfigError

KEY_ARTIST_HANDLES = "artist_handles"

# Instagram usernames: letters, digits, dots and underscores, at most 30 characters.
_HANDLE = re.compile(r"[A-Za-z0-9._]{1,30}")

Handles = dict[str, str | None]


def artist_key(name: str) -> str:
    return " ".join(name.split()).casefold()


def clean_handle(raw: str) -> str:
    """``@name`` or ``name`` -> ``name``; ``ConfigError`` when it cannot be an Instagram handle."""
    handle = raw.strip().removeprefix("@")
    if not _HANDLE.fullmatch(handle):
        raise ConfigError(
            f"{raw.strip()!r} is not an Instagram handle: letters, digits, . and _ only, "
            "30 characters at most."
        )
    return handle


def normalize(handles: dict[str, str | None]) -> Handles:
    """Validate a whole map: keys to lower case, handles without ``@``."""
    result: Handles = {}
    for name, handle in handles.items():
        key = artist_key(name)
        if not key:
            raise ConfigError("An Artist Handle needs an artist name.")
        result[key] = None if handle is None else clean_handle(handle)
    return result


def load_handles(settings: SettingsRepo) -> Handles:
    """The stored map; anything unreadable counts as empty."""
    raw = settings.get(KEY_ARTIST_HANDLES)
    if raw is None:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {
        str(k): (v if isinstance(v, str) else None)
        for k, v in data.items()
        if v is None or isinstance(v, str)
    }


def save_handles(settings: SettingsRepo, handles: dict[str, str | None]) -> Handles:
    clean = normalize(handles)
    settings.set(KEY_ARTIST_HANDLES, json.dumps(clean))
    return clean


def set_handle(settings: SettingsRepo, artist: str, handle: str | None) -> Handles:
    """Record one artist's handle (``None`` = a style, not an artist); the rest stay."""
    return save_handles(settings, {**load_handles(settings), artist: handle})


def title_artists(title: str) -> list[str]:
    """The artists the title names, in order, once each; empty when the title does not read."""
    try:
        names = parse_youtube_title(title).artists
    except BeatStarsError:
        return []
    seen: set[str] = set()
    artists = []
    for name in names:
        key = artist_key(name)
        if key and key not in seen:
            seen.add(key)
            artists.append(name)
    return artists


def unknown_artists(handles: Handles, artists: list[str]) -> list[str]:
    """Artists with no entry at all; a style (``None``) is known."""
    return [a for a in artists if artist_key(a) not in handles]


def tag_handles(handles: Handles, artists: list[str]) -> list[str]:
    """``@handle`` for each artist that has one; styles and unknown artists are left out."""
    tags = []
    for name in artists:
        handle = handles.get(artist_key(name))
        if handle:
            tags.append(f"@{handle}")
    return tags
