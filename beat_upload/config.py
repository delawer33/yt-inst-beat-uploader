"""Per-beat metadata loaded from ``config.yaml``.

Expected layout::

    youtube:
      title: "My Beat"
      description: "..."
      tags: [beats, instrumental]
      category_id: 10
      privacy_status: private   # private | public | unlisted
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any

import yaml

from beat_upload.errors import ConfigError

MAX_TITLE_LENGTH = 100
MAX_DESCRIPTION_LENGTH = 5000
MAX_TAGS_LENGTH = 500  # YouTube counts the characters of all tags together
MUSIC_CATEGORY_ID = 10


class PrivacyStatus(StrEnum):
    PRIVATE = "private"
    PUBLIC = "public"
    UNLISTED = "unlisted"


@dataclass(frozen=True)
class YouTubeMetadata:
    title: str
    description: str = ""
    tags: list[str] = field(default_factory=list)
    category_id: int = MUSIC_CATEGORY_ID
    privacy_status: PrivacyStatus = PrivacyStatus.PRIVATE

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any]) -> "YouTubeMetadata":
        """Build and validate metadata from the ``youtube`` section of config.yaml."""
        title = data.get("title", "")
        if not isinstance(title, str) or not title.strip():
            raise ConfigError("youtube.title cannot be empty")
        if len(title) > MAX_TITLE_LENGTH:
            raise ConfigError(f"youtube.title must be <= {MAX_TITLE_LENGTH} characters")

        description = data.get("description") or ""
        if not isinstance(description, str):
            raise ConfigError("youtube.description must be a string")
        if len(description) > MAX_DESCRIPTION_LENGTH:
            raise ConfigError(f"youtube.description must be <= {MAX_DESCRIPTION_LENGTH} characters")

        tags = data.get("tags") or []
        if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
            raise ConfigError("youtube.tags must be a list of strings")
        if sum(len(t) for t in tags) > MAX_TAGS_LENGTH:
            raise ConfigError(f"youtube.tags must be <= {MAX_TAGS_LENGTH} characters in total")

        category_id = _parse_category_id(data.get("category_id", MUSIC_CATEGORY_ID))
        privacy_status = _parse_privacy_status(
            data.get("privacy_status", PrivacyStatus.PRIVATE.value)
        )

        return cls(
            title=title,
            description=description,
            tags=list(tags),
            category_id=category_id,
            privacy_status=privacy_status,
        )


def load_youtube_metadata(config_path: Path) -> YouTubeMetadata:
    """Read ``config.yaml`` and return its validated ``youtube`` section."""
    if not config_path.is_file():
        raise ConfigError(f"{config_path.name} not found in {config_path.parent}")

    try:
        raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise ConfigError(f"Cannot parse {config_path}: {e}") from e

    if not isinstance(raw, dict):
        raise ConfigError(f"{config_path} must contain a mapping at the top level")

    youtube = raw.get("youtube")
    if not isinstance(youtube, dict):
        raise ConfigError(f"{config_path} must contain a 'youtube' section")

    return YouTubeMetadata.from_mapping(youtube)


def _parse_category_id(value: Any) -> int:
    if isinstance(value, bool) or not str(value).isdigit():
        raise ConfigError("youtube.category_id must be a positive integer")
    return int(value)


def _parse_privacy_status(value: Any) -> PrivacyStatus:
    try:
        return PrivacyStatus(str(value))
    except ValueError:
        allowed = ", ".join(s.value for s in PrivacyStatus)
        raise ConfigError(f"youtube.privacy_status must be one of: {allowed}") from None
