"""Fill from title: a Draft's description and tags written from its title (CONTEXT.md).

The Template gives the shape, the title the artists and substyle, the audio file name BPM
and key, and the model adds neighbouring keywords. ``FillService`` builds the prompt, runs
it through a **runner** (``claude_cli.run_claude`` in the app, a fake in tests), and
validates the answer with ``YouTubeMetadata.from_mapping``, the same validator as every
other edit. Nothing is saved here: the answer goes into the owner's form (ADR 0006).
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import PurePath
from typing import Any

from beat_server.db.models import Beat, BeatStatus
from beat_server.services.beats import KEY_DESCRIPTION_TEMPLATE, KEY_TAGS_TEMPLATE
from beat_server.services.errors import BeatStateError, FillError
from beat_upload.audio_name import audio_name_facts
from beat_upload.beatstars.catalog import INSTRUMENTS, MOODS, in_catalog
from beat_upload.beatstars.naming import MAX_MOODS, spelled_key
from beat_upload.beatstars.track import MAX_INSTRUMENTS
from beat_upload.config import MAX_TAGS_LENGTH, YouTubeMetadata
from beat_upload.errors import ConfigError
from beat_upload.placeholders import placeholders_in

Runner = Callable[[str, dict[str, Any]], dict[str, Any]]

FILL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "description": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
        "beatstars_moods": {"type": "array", "items": {"type": "string"}},
        "beatstars_instruments": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["description", "tags", "beatstars_moods", "beatstars_instruments"],
    "additionalProperties": False,
}

RULES = f"""\
Rules, in this order:
1. The shape and wording come from the Templates. Keep every line, emoji, link and sentence of
   the description Template; only the [[...]] Placeholders change. `{{name}}` in a Template
   stood for the audio file's name; the title may have renamed the beat since, so write the
   name the title gives it (the quoted name).
2. Fill the Placeholders from the title. "Artist" is whatever stands before "Type Beat" in the
   title; the substyle is what follows the last "|". Where the Template repeats the title, write
   the title exactly as given.
3. Where the current description or tags already hold the owner's own words in place of a
   Placeholder (BPM, key, a mood, the sentence about the sound), keep those words.
4. If the title names one artist, drop every tag, hashtag and part of a sentence about the
   second one, so nothing reads half-empty.
5. If the title names no artist, only a style such as "RnB Type Beat", that style plays the
   artist everywhere.
6. Draft the sentence about the sound from the title and the substyle: one plain sentence.
7. BPM and key: use the ones given below; if they are not known and the owner has not written
   them, leave those Placeholders exactly as they are.
8. Hashtags are lower case with no spaces: #travisscotttypebeat.
9. Tags: the Template's artist tags first, then the substyle, then five to eight neighbouring
   keywords (related artists, adjacent styles), then the rest of the Template's tags. All tags
   together stay within {MAX_TAGS_LENGTH} characters, counting the quotes YouTube puts around a
   tag with a space and the commas between tags. No tag is repeated.
10. Never write < or > anywhere. Never change the title.
Answer only through the structured output, and write nothing before it: `description` is the
complete finished description, every line of it, ready to paste into YouTube; `tags` is the
list of tags. `beatstars_moods` and `beatstars_instruments` are described at the end of the
prompt; where it does not ask for them, answer empty lists."""

BEATSTARS_RULES = """\
This beat also goes to BeatStars, whose forms take only the values of two fixed lists. The
owner wrote moods and instruments in the Bounce Folder's name, possibly misspelled or in
Russian. Match each word to the closest value of the list, using its spelling from the list.
- `beatstars_moods`: first the owner's moods that match a Mood, in the owner's order; then add
  Moods that fit the substyle of the title until there are three. At most five in all.
- `beatstars_instruments`: only the owner's instruments that match an Instrument. Never add
  one of your own. If none of the owner's words matches, answer an empty list.
- A word that matches nothing in the list is left out. Write only values copied from the lists.

Moods:
{moods}

Instruments:
{instruments}

The owner's moods: {name_moods}
The owner's instruments: {name_instruments}
"""


@dataclass(frozen=True)
class Filled:
    description: str
    tags: list[str]
    beatstars_moods: list[str] = field(default_factory=list)
    beatstars_instruments: list[str] = field(default_factory=list)


class FillService:
    def __init__(self, runner: Runner) -> None:
        self._run = runner

    def fill(
        self,
        beat: Beat,
        *,
        title: str,
        description: str,
        tags: list[str],
        templates: dict[str, Any],
    ) -> Filled:
        """Description and tags for ``beat`` from the form's current ``title``, ``description``
        and ``tags`` (unsaved edits count) and the owner's ``templates``.

        ``BeatStateError`` for anything but a Draft, ``ConfigError`` for a title that still
        holds a Placeholder or is invalid, ``FillError`` when the runner fails or the answer
        is something YouTube would not take.
        """
        if beat.status != BeatStatus.DRAFT:
            raise BeatStateError(f"Beat {beat.id} is {beat.status}; only a Draft can be filled.")
        left = placeholders_in(title)
        if left:
            raise ConfigError(f"Title still has {left[0]}; fix the title first.")
        YouTubeMetadata.from_mapping({"title": title})

        prompt = build_prompt(beat, title, description, tags, templates)
        answer = self._run(prompt, FILL_SCHEMA)
        filled = _parse(answer, beat.bounce_folder is not None)
        try:
            YouTubeMetadata.from_mapping(
                {"title": title, "description": filled.description, "tags": filled.tags}
            )
        except ConfigError as e:
            raise FillError(
                f"The fill came back with something YouTube would not take ({e}). "
                "The form was left as it was; try again."
            ) from None
        return filled


def build_prompt(
    beat: Beat, title: str, description: str, tags: list[str], templates: dict[str, Any]
) -> str:
    audio_facts = audio_name_facts(beat.source_name) if beat.source_name else None
    if beat.bpm is not None and beat.music_key is not None:  # from the Bounce Folder's name
        bpm_key = f"BPM {beat.bpm}, key {spelled_key(beat.music_key)}"
        origin = "the Bounce Folder's name"
    elif audio_facts is not None:
        bpm_key = f"BPM {audio_facts.bpm}, key {audio_facts.spelled_key}"
        origin = "the file name"
    else:
        bpm_key = "not known"
        origin = "the file name"
    source = PurePath(beat.source_name).name if beat.source_name else "not known"
    tags_template = "\n".join(str(t) for t in templates.get(KEY_TAGS_TEMPLATE, []))
    return f"""\
You write the YouTube description and tags of a beat (an instrumental) for its producer.
Fill the producer's Templates for the title below.

{RULES}

Title:
{title}

Audio file name: {source}
BPM and key from {origin}: {bpm_key}

Description Template:
```
{templates.get(KEY_DESCRIPTION_TEMPLATE, "")}
```

Tags Template, one per line:
```
{tags_template}
```

Current description (may already hold the owner's words):
```
{description}
```

Current tags, one per line:
```
{"\n".join(tags)}
```
{_beatstars_section(beat)}"""


def _beatstars_section(beat: Beat) -> str:
    if beat.bounce_folder is None:
        return (
            "\nThis beat does not go to BeatStars: answer empty beatstars_moods and instruments.\n"
        )
    return "\n" + BEATSTARS_RULES.format(
        moods=", ".join(MOODS),
        instruments=", ".join(INSTRUMENTS),
        name_moods=", ".join(beat.name_moods) or "none",
        name_instruments=", ".join(beat.name_instruments) or "none",
    )


def _parse(answer: dict[str, Any], bounce: bool = False) -> Filled:
    description = answer.get("description")
    tags = answer.get("tags")
    if not isinstance(description, str) or not (
        isinstance(tags, list) and all(isinstance(t, str) for t in tags)
    ):
        raise FillError("The fill did not come back as a description and a list of tags.")
    clean: list[str] = []
    seen: set[str] = set()
    for tag in (t.strip() for t in tags):
        if tag and tag.lower() not in seen:
            seen.add(tag.lower())
            clean.append(tag)
    if not bounce:
        return Filled(description=description.strip(), tags=clean)
    return Filled(
        description=description.strip(),
        tags=clean,
        beatstars_moods=in_catalog(_strings(answer.get("beatstars_moods")), MOODS)[:MAX_MOODS],
        beatstars_instruments=in_catalog(
            _strings(answer.get("beatstars_instruments")), INSTRUMENTS
        )[:MAX_INSTRUMENTS],
    )


def _strings(value: Any) -> list[str]:
    """The strings of a list answer; anything else is no answer."""
    return [v for v in value if isinstance(v, str)] if isinstance(value, list) else []
