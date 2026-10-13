"""The Instagram Post: what the owner types into Instagram for a Beat's Reel (CONTEXT.md).

``InstagramService.write`` builds a prompt from the Beat's title, BPM, key, moods,
instruments and YouTube description, runs it through the same **runner** as Fill from title
(``claude_cli.run_claude`` in the app, a fake in tests; ADR 0006), validates the answer and
saves it with the Beat. The full caption is assembled by code (``assemble_caption``), never
by the model.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import PurePath
from typing import Any

from sqlalchemy.orm import Session

from beat_server.db.models import Beat
from beat_server.db.repo import BeatRepo
from beat_server.services.errors import FillError
from beat_upload.audio_name import audio_name_facts
from beat_upload.beatstars.naming import PRODUCER, spelled_key
from beat_upload.beatstars.track import parse_youtube_title
from beat_upload.errors import BeatStarsError, ConfigError
from beat_upload.placeholders import placeholders_in

Runner = Callable[[str, dict[str, Any]], dict[str, Any]]

MAX_CAPTION_LENGTH = 2200  # Instagram's limit
MAX_HOOK_LENGTH = 60
MAX_HASHTAGS = 5  # Instagram's limit since December 2025
OWN_HASHTAG = "prodbydelawer"

INSTAGRAM_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "hook": {"type": "string"},
        "caption_body": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
        "audio_name": {"type": "string"},
        "alt_text": {"type": "string"},
    },
    "required": ["hook", "caption_body", "hashtags", "audio_name", "alt_text"],
    "additionalProperties": False,
}

RULES = f"""\
Rules:
1. English only.
2. `hook`: the short text shown over the static cover in the Reel, at most {MAX_HOOK_LENGTH}
   characters, one emoji at most. It makes a scroller stop, e.g. "this guitar x reggaeton beat
   is crazy".
3. `caption_body`: the caption without hashtags. Its first line holds the searchable words:
   the beat's name in quotes, its style, the BPM and the key, e.g.
   "Dance With Me" - guitar x reggaeton type beat, 90 BPM, A minor.
   Then one plain sentence about the sound (take it from the YouTube description below), a
   line that the beat is free for non-profit use, and "link in bio" together with an
   invitation to comment (an emoji) to get the link by DM. Links in a caption are not
   clickable, so never write a URL.
4. `hashtags`: at most {MAX_HASHTAGS}, lower case, no spaces, written without the # sign.
   Mid-sized tags (20k to 500k posts) for the beat's style and artists, no giants like
   "music" or "beats". One of them is always "{OWN_HASHTAG}".
5. `audio_name`: the name of the Reel's sound, exactly "NAME (prod. {PRODUCER})" where NAME is
   the beat's name from the title.
6. `alt_text`: one sentence describing the Reel's cover for screen readers, naming the beat,
   its style and {PRODUCER}.
7. Never write an @ sign anywhere: the owner adds the artists' accounts himself.
8. Answer only through the structured output."""


@dataclass(frozen=True)
class InstagramPost:
    hook: str
    caption_body: str
    hashtags: list[str]  # without the # sign
    audio_name: str
    alt_text: str

    def caption(self, tags: list[str] | None = None) -> str:
        """The caption with the artists' ``@handle`` line (``tags``) after the body."""
        return assemble_caption(self.caption_body, self.hashtags, tags)

    def to_json(self) -> dict[str, Any]:
        return {
            "hook": self.hook,
            "caption_body": self.caption_body,
            "hashtags": list(self.hashtags),
            "audio_name": self.audio_name,
            "alt_text": self.alt_text,
        }

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "InstagramPost":
        return cls(
            hook=data["hook"],
            caption_body=data["caption_body"],
            hashtags=list(data["hashtags"]),
            audio_name=data["audio_name"],
            alt_text=data["alt_text"],
        )


def assemble_caption(body: str, hashtags: list[str], tags: list[str] | None = None) -> str:
    """The caption as pasted into Instagram: the body, the line of ``@handle`` tags (from the
    Artist Handles, never the model's), a blank line, the hashtags.

    ``ConfigError`` when it is longer than Instagram's 2200 characters.
    """
    text = "\n".join(part for part in (body.strip(), " ".join(tags or [])) if part)
    parts = [text, " ".join(f"#{tag}" for tag in hashtags)]
    caption = "\n\n".join(part for part in parts if part)
    if len(caption) > MAX_CAPTION_LENGTH:
        raise ConfigError(
            f"The caption is {len(caption)} characters; Instagram takes {MAX_CAPTION_LENGTH}."
        )
    return caption


def instagram_publish_time(beat: Beat) -> datetime | None:
    """When the beat goes public on YouTube: its schedule, else the time it was published."""
    return beat.publish_at or beat.published_at


class InstagramService:
    def __init__(self, runner: Runner) -> None:
        self._run = runner

    def write(self, session: Session, beat: Beat, tags: list[str] | None = None) -> InstagramPost:
        """Write the Instagram Post of ``beat`` (again, replacing the one it has) and save it.

        ``ConfigError`` for a title with a Placeholder or one that does not read,
        ``FillError`` when the runner fails or the answer breaks a rule. ``tags`` are the
        ``@handle`` tags the caption will carry, so the 2200 limit is checked with them.
        """
        left = placeholders_in(beat.title)
        if left:
            raise ConfigError(f"Title still has {left[0]}; fix the title first.")
        try:
            parse_youtube_title(beat.title)
        except BeatStarsError as e:
            raise ConfigError(str(e)) from None
        answer = self._run(build_prompt(beat), INSTAGRAM_SCHEMA)
        post = parse_answer(answer, tags)
        beat.instagram_post = post.to_json()
        BeatRepo(session).save(beat)
        return post


def build_prompt(beat: Beat) -> str:
    return f"""\
You write what a beat producer types into Instagram when he posts a Reel of his beat (an
instrumental, the cover over the full track).

{RULES}

Title:
{beat.title}

{_facts(beat)}
YouTube hashtags: {" ".join(re.findall(r"#\w+", beat.description)) or "none"}

YouTube description (it holds the sentence about the sound):
```
{beat.description}
```
"""


def _facts(beat: Beat) -> str:
    audio = audio_name_facts(beat.source_name) if beat.source_name else None
    if beat.bpm is not None and beat.music_key is not None:
        bpm_key = f"BPM {beat.bpm}, key {spelled_key(beat.music_key)}"
    elif audio is not None:
        bpm_key = f"BPM {audio.bpm}, key {audio.spelled_key}"
    else:
        bpm_key = "not known (leave BPM and key out of the first line)"
    source = PurePath(beat.source_name).name if beat.source_name else "not known"
    return (
        f"Audio file name: {source}\n"
        f"BPM and key: {bpm_key}\n"
        f"Moods: {', '.join(beat.name_moods) or 'none given'}\n"
        f"Instruments: {', '.join(beat.name_instruments) or 'none given'}"
    )


def parse_answer(answer: dict[str, Any], tags: list[str] | None = None) -> InstagramPost:
    """Validate the model's answer; ``FillError`` names the rule it broke."""
    texts = {}
    for key in ("hook", "caption_body", "audio_name", "alt_text"):
        value = answer.get(key)
        if not isinstance(value, str) or not value.strip():
            raise FillError(f"The Instagram Post came back without its {key}. Try again.")
        texts[key] = value.strip()
    raw = answer.get("hashtags")
    if not isinstance(raw, list) or not all(isinstance(h, str) for h in raw):
        raise FillError("The Instagram Post came back without a list of hashtags. Try again.")
    hashtags = [h.strip().removeprefix("#") for h in raw]
    if len(hashtags) > MAX_HASHTAGS:
        raise FillError(
            f"The Instagram Post came back with {len(hashtags)} hashtags; "
            f"Instagram takes {MAX_HASHTAGS}. Try again."
        )
    if any(not h or re.search(r"[\s#]", h) for h in hashtags):
        raise FillError("A hashtag of the Instagram Post is empty or has a space. Try again.")
    if len({h.lower() for h in hashtags}) != len(hashtags):
        raise FillError("The Instagram Post repeats a hashtag. Try again.")
    if len(texts["hook"]) > MAX_HOOK_LENGTH:
        raise FillError(
            f"The hook is {len(texts['hook'])} characters; the limit is {MAX_HOOK_LENGTH}. "
            "Try again."
        )
    if any("@" in part for part in [*texts.values(), *hashtags]):
        raise FillError("The Instagram Post has an @ in it; the model must not tag. Try again.")
    post = InstagramPost(hashtags=hashtags, **texts)
    try:
        post.caption(tags)
    except ConfigError as e:
        raise FillError(f"{e} Try again.") from None
    return post
