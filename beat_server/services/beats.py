"""A new Beat from two uploaded files, and edits to its Metadata while it is still a draft.

The only validator is ``YouTubeMetadata.from_mapping``: ``apply_patch`` merges the patch into
the beat's current metadata and runs it through there, so the web UI and ``config.yaml`` are
held to exactly the same limits. Templates for a new beat (title, description, tags) live in
``SettingsRepo`` under the ``KEY_*`` keys; ``{name}`` in a template is the audio file's stem.
"""

import json
import shutil
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from beat_server.api.schemas import BeatPatch
from beat_server.db.models import Beat, BeatStatus, new_id
from beat_server.db.repo import BeatRepo, SettingsRepo
from beat_server.services.errors import BeatStateError
from beat_upload.beat_folder import AUDIO_EXTENSIONS, IMAGE_EXTENSIONS
from beat_upload.config import MAX_TITLE_LENGTH, PrivacyStatus, YouTubeMetadata
from beat_upload.errors import BeatFolderError
from beat_upload.workspace import Workspace

KEY_TITLE_TEMPLATE = "title_template"
KEY_DESCRIPTION_TEMPLATE = "description_template"
KEY_TAGS_TEMPLATE = "tags_template"

DEFAULT_TITLE_TEMPLATE = "{name}"
DEFAULT_DESCRIPTION_TEMPLATE = ""
DEFAULT_TAGS_TEMPLATE: list[str] = []

NAME_PLACEHOLDER = "{name}"

AUDIO_BASENAME = "audio"
COVER_BASENAME = "cover"

EDITABLE = frozenset({BeatStatus.DRAFT, BeatStatus.QUEUED})


def default_metadata(settings: SettingsRepo) -> dict[str, Any]:
    """The owner's templates for a new beat, with sane defaults when none were saved."""
    title = settings.get(KEY_TITLE_TEMPLATE)
    description = settings.get(KEY_DESCRIPTION_TEMPLATE)
    tags = parse_tags_template(settings.get(KEY_TAGS_TEMPLATE))
    return {
        KEY_TITLE_TEMPLATE: title if title is not None else DEFAULT_TITLE_TEMPLATE,
        KEY_DESCRIPTION_TEMPLATE: (
            description if description is not None else DEFAULT_DESCRIPTION_TEMPLATE
        ),
        KEY_TAGS_TEMPLATE: tags,
    }


def save_templates(
    settings: SettingsRepo,
    *,
    title: str | None = None,
    description: str | None = None,
    tags: list[str] | None = None,
) -> None:
    """Persist whichever templates are given; ``None`` leaves that one untouched."""
    if title is not None:
        settings.set(KEY_TITLE_TEMPLATE, title)
    if description is not None:
        settings.set(KEY_DESCRIPTION_TEMPLATE, description)
    if tags is not None:
        settings.set(KEY_TAGS_TEMPLATE, json.dumps(list(tags)))


def parse_tags_template(raw: str | None) -> list[str]:
    """Tags are stored as a JSON list; anything unreadable counts as no template."""
    if raw is None:
        return list(DEFAULT_TAGS_TEMPLATE)
    try:
        tags = json.loads(raw)
    except ValueError:
        return list(DEFAULT_TAGS_TEMPLATE)
    if not isinstance(tags, list):
        return list(DEFAULT_TAGS_TEMPLATE)
    return [str(t) for t in tags]


def render_template(template: str, name: str) -> str:
    return template.replace(NAME_PLACEHOLDER, name)


def create_draft(
    ws: Workspace, repo: BeatRepo, audio: UploadFile, image: UploadFile, template: dict[str, Any]
) -> Beat:
    """Store both files under the new beat's directory and add a DRAFT row.

    Raises ``BeatFolderError`` when a file has the wrong extension (two audio files,
    an unknown format, ...). Paths on the row are relative to ``ws.beat_dir(id)``.
    """
    audio_ext = _checked_suffix(audio, AUDIO_EXTENSIONS, "audio")
    image_ext = _checked_suffix(image, IMAGE_EXTENSIONS, "image")

    beat_id = new_id()
    beat_dir = ws.beat_dir(beat_id)
    beat_dir.mkdir(parents=True, exist_ok=False)
    audio_name = f"{AUDIO_BASENAME}{audio_ext}"
    image_name = f"{COVER_BASENAME}{image_ext}"
    try:
        _store(audio, beat_dir / audio_name)
        _store(image, beat_dir / image_name)
    except OSError:
        shutil.rmtree(beat_dir, ignore_errors=True)
        raise

    name = Path(audio.filename or "").stem or "Untitled"
    title = render_template(str(template.get(KEY_TITLE_TEMPLATE, DEFAULT_TITLE_TEMPLATE)), name)
    description = render_template(
        str(template.get(KEY_DESCRIPTION_TEMPLATE, DEFAULT_DESCRIPTION_TEMPLATE)), name
    )
    tags = [str(t) for t in template.get(KEY_TAGS_TEMPLATE, DEFAULT_TAGS_TEMPLATE)]
    beat = Beat(
        id=beat_id,
        status=BeatStatus.DRAFT,
        title=title[:MAX_TITLE_LENGTH],
        description=description,
        tags=tags,
        privacy=PrivacyStatus.PRIVATE.value,
        audio_path=audio_name,
        image_path=image_name,
    )
    return repo.add(beat)


def metadata_of(beat: Beat) -> YouTubeMetadata:
    """The beat's Metadata as ``upload_video`` wants it (validated on the way)."""
    return YouTubeMetadata.from_mapping(_mapping(beat))


def apply_patch(beat: Beat, patch: BeatPatch) -> Beat:
    """Merge ``patch`` into the beat's Metadata; ``ConfigError`` if the result is invalid.

    Mutates ``beat`` in place and returns it; the caller saves.
    """
    data = _mapping(beat)
    if patch.title is not None:
        data["title"] = patch.title
    if patch.description is not None:
        data["description"] = patch.description
    if patch.tags is not None:
        data["tags"] = patch.tags
    if patch.privacy is not None:
        data["privacy_status"] = patch.privacy.value
    metadata = YouTubeMetadata.from_mapping(data)
    beat.title = metadata.title
    beat.description = metadata.description
    beat.tags = list(metadata.tags)
    beat.privacy = metadata.privacy_status.value
    return beat


def delete_draft(ws: Workspace, repo: BeatRepo, beat: Beat) -> None:
    """Remove a DRAFT beat and its files. Anything further along is a ``BeatStateError``."""
    if beat.status != BeatStatus.DRAFT:
        raise BeatStateError(f"Beat {beat.id} is {beat.status}; only drafts can be deleted here.")
    shutil.rmtree(ws.beat_dir(beat.id), ignore_errors=True)
    repo.delete(beat)


def _mapping(beat: Beat) -> dict[str, Any]:
    return {
        "title": beat.title,
        "description": beat.description,
        "tags": list(beat.tags),
        "category_id": beat.category_id,
        "privacy_status": beat.privacy,
    }


def _checked_suffix(upload: UploadFile, allowed: frozenset[str], kind: str) -> str:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in allowed:
        expected = ", ".join(sorted(allowed))
        got = upload.filename or "a file without a name"
        raise BeatFolderError(f"Expected an {kind} file ({expected}), got {got}.")
    return suffix


def _store(upload: UploadFile, target: Path) -> None:
    upload.file.seek(0)
    with target.open("wb") as out:
        shutil.copyfileobj(upload.file, out)
