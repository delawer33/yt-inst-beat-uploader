"""Per-beat metadata loaded from ``config.yaml``.

Expected layout::

    youtube:
      title: "My Beat"
      description: "..."
      tags: [beats, instrumental]
      category_id: 10
      privacy_status: private   # private | public | unlisted
      publish_at: 2026-10-01 18:00   # optional, local time; needs private (Scheduled)

``publish_at`` is the time YouTube itself makes the video public (``status.publishAt``).
It is read as local time unless it carries an offset, and kept as an aware UTC datetime.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from pathlib import Path
from typing import Any

import yaml

from beat_upload.errors import ConfigError

MAX_TITLE_LENGTH = 100
MAX_DESCRIPTION_LENGTH = 5000
MAX_TAGS_LENGTH = 500  # YouTube counts the characters of all tags together
MUSIC_CATEGORY_ID = 10
# YouTube wants a scheduled publish time in the future; a few minutes of slack cover the
# clock skew and the time the render and upload take before the time is actually sent.
PUBLISH_AT_MIN_LEAD = timedelta(minutes=5)


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
    publish_at: datetime | None = None  # aware, UTC

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
        publish_at = _parse_publish_at(data.get("publish_at"))
        if publish_at is not None:
            _check_publish_at(publish_at, privacy_status)

        return cls(
            title=title,
            description=description,
            tags=list(tags),
            category_id=category_id,
            privacy_status=privacy_status,
            publish_at=publish_at,
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


def _parse_publish_at(value: Any) -> datetime | None:
    """``None``/empty -> None; a datetime or ISO string -> aware UTC (naive means local time)."""
    if value is None or value == "":
        return None
    if isinstance(value, str):
        text = value.strip()
        try:
            # ``fromisoformat`` accepts a bare date; the length check insists on a time part.
            value = datetime.fromisoformat(text) if len(text) > len("2026-10-01") else None
        except ValueError:
            value = None
    if not isinstance(value, datetime):  # a bare YAML date (2026-10-01) is a ``date``, not ok
        raise ConfigError(
            "youtube.publish_at must be a date and time, e.g. 2026-10-01 18:00 (local time)"
        )
    if value.tzinfo is None:
        value = value.astimezone()  # system local time
    return value.astimezone(UTC)


def _check_publish_at(publish_at: datetime, privacy_status: PrivacyStatus) -> None:
    shown = publish_at.astimezone().strftime("%Y-%m-%d %H:%M")
    if privacy_status is not PrivacyStatus.PRIVATE:
        raise ConfigError(
            f"youtube.publish_at ({shown}) is only allowed with privacy_status: private; "
            "YouTube makes the video public at that time"
        )
    now = datetime.now(UTC)
    if publish_at <= now:
        raise ConfigError(f"youtube.publish_at ({shown}) has already passed; pick a new time")
    if publish_at < now + PUBLISH_AT_MIN_LEAD:
        minutes = int(PUBLISH_AT_MIN_LEAD.total_seconds() // 60)
        raise ConfigError(
            f"youtube.publish_at ({shown}) must be at least {minutes} minutes in the future; "
            "pick a later time"
        )
