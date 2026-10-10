"""What a Beat from a Bounce Folder will put on BeatStars (CONTEXT.md, "BeatStars Track").

The same ``BeatStarsTrack`` the BEATSTARS job later publishes is built here for the Draft
page, so the owner sees the title, tags and genres before sending. Moods and instruments
are the ones Fill from title matched; before it ran, the exact words of the Bounce Folder's
name that are in the BeatStars lists, and moods from the substyle.
"""

from beat_server.db.models import Beat
from beat_upload.beatstars.catalog import INSTRUMENTS, MOODS, in_catalog
from beat_upload.beatstars.naming import MAX_MOODS
from beat_upload.beatstars.track import (
    MAX_INSTRUMENTS,
    BeatStarsTrack,
    moods_for_genre,
    parse_youtube_title,
    track_for_beat,
)
from beat_upload.errors import BeatStarsError

MIN_MOODS = 3


def track_of(beat: Beat) -> BeatStarsTrack:
    """The BeatStars Track of ``beat``; ``BeatStarsError`` when its title does not read yet
    (not ``[FREE] A Type Beat 2026 - "NAME" | Genre``) or something is out of range."""
    if beat.bpm is None or beat.music_key is None:
        raise BeatStarsError("This Beat has no BPM and key from a Bounce Folder.")
    moods = list(beat.beatstars_moods) or _moods_before_fill(beat)
    instruments = list(beat.beatstars_instruments) or in_catalog(beat.name_instruments, INSTRUMENTS)
    return track_for_beat(
        beat.title,
        beat.bpm,
        beat.music_key,
        moods[:MAX_MOODS],
        instruments[:MAX_INSTRUMENTS],
        beat.samples,
    )


def _moods_before_fill(beat: Beat) -> list[str]:
    """The owner's moods that are exactly BeatStars moods, topped up to three from the
    substyle: what Fill from title does, without the model's spelling help."""
    moods = in_catalog(beat.name_moods, MOODS)
    for mood in moods_for_genre(parse_youtube_title(beat.title).genre):
        if len(moods) >= MIN_MOODS:
            break
        if mood not in moods:
            moods.append(mood)
    return moods
