"""What an Effect render needs from a Beat: the words of the header and the seed.

The header shows the beat's name and its artists as the YouTube title names them (see
``EffectMeta.of_title``); BPM and key come from the Bounce Folder. ``Beat.header`` is the
same words as the model keeps them next to the file, to tell a stale video from a current one.
"""

from beat_server.db.models import Beat
from beat_upload.visual.render import EffectMeta, seed_for


def effect_meta_of(beat: Beat) -> EffectMeta:
    return EffectMeta.of_title(beat.title, beat.bpm, beat.music_key)


def effect_seed_of(beat: Beat) -> int:
    return seed_for(beat.id)
