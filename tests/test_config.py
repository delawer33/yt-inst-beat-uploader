from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from beat_upload.config import (
    MAX_DESCRIPTION_LENGTH,
    MAX_TITLE_LENGTH,
    PrivacyStatus,
    YouTubeMetadata,
    load_youtube_metadata,
)
from beat_upload.errors import ConfigError

VALID = {
    "title": "My Beat",
    "description": "Prod. by me",
    "tags": ["beats", "trap"],
    "category_id": 10,
    "privacy_status": "public",
}


def test_from_mapping_full() -> None:
    meta = YouTubeMetadata.from_mapping(VALID)
    assert meta == YouTubeMetadata(
        title="My Beat",
        description="Prod. by me",
        tags=["beats", "trap"],
        category_id=10,
        privacy_status=PrivacyStatus.PUBLIC,
    )


def test_from_mapping_defaults() -> None:
    meta = YouTubeMetadata.from_mapping({"title": "Only title"})
    assert meta.description == ""
    assert meta.tags == []
    assert meta.category_id == 10
    assert meta.privacy_status is PrivacyStatus.PRIVATE


def test_category_id_accepts_numeric_string() -> None:
    assert YouTubeMetadata.from_mapping({"title": "t", "category_id": "22"}).category_id == 22


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"title": ""}, "title cannot be empty"),
        ({"title": "x" * (MAX_TITLE_LENGTH + 1)}, "title must be <="),
        ({"description": "x" * (MAX_DESCRIPTION_LENGTH + 1)}, "description must be <="),
        ({"title": "Beat <<NAME>>"}, "title cannot contain < or >"),
        ({"description": "BPM: <<140>>"}, "description cannot contain < or >"),
        ({"tags": "beats"}, "tags must be a list"),
        ({"tags": ["ok", 1]}, "tags must be a list"),
        ({"category_id": "music"}, "category_id must be"),
        ({"category_id": True}, "category_id must be"),
        ({"privacy_status": "secret"}, "privacy_status must be one of"),
    ],
)
def test_from_mapping_rejects_invalid(override: dict, message: str) -> None:
    with pytest.raises(ConfigError, match=message):
        YouTubeMetadata.from_mapping({**VALID, **override})


def test_load_from_file(tmp_path: Path) -> None:
    cfg = tmp_path / "config.yaml"
    cfg.write_text(
        "youtube:\n  title: Hello\n  tags: [a, b]\n  category_id: 10\n  privacy_status: unlisted\n"
    )
    meta = load_youtube_metadata(cfg)
    assert meta.title == "Hello"
    assert meta.privacy_status is PrivacyStatus.UNLISTED


@pytest.mark.parametrize(
    ("content", "message"),
    [
        (None, "not found"),
        ("- just\n- a list\n", "mapping at the top level"),
        ("instagram: {}\n", "'youtube' section"),
        ("youtube: [\n", "Cannot parse"),
    ],
)
def test_load_rejects_bad_files(tmp_path: Path, content: str | None, message: str) -> None:
    cfg = tmp_path / "config.yaml"
    if content is not None:
        cfg.write_text(content)
    with pytest.raises(ConfigError, match=message):
        load_youtube_metadata(cfg)


def test_tags_total_length_limit() -> None:
    from beat_upload.config import MAX_TAGS_LENGTH

    ok = {"title": "t", "tags": ["a" * MAX_TAGS_LENGTH]}
    assert YouTubeMetadata.from_mapping(ok).tags == ["a" * MAX_TAGS_LENGTH]
    with pytest.raises(ConfigError, match="tags must be <="):
        YouTubeMetadata.from_mapping({"title": "t", "tags": ["a" * 300, "b" * 201]})


# --- publish_at ------------------------------------------------------------------------------


def in_future(**delta: int) -> datetime:
    return datetime.now(UTC).replace(microsecond=0) + timedelta(**delta)


def test_publish_at_defaults_to_none() -> None:
    assert YouTubeMetadata.from_mapping({"title": "t"}).publish_at is None
    assert YouTubeMetadata.from_mapping({"title": "t", "publish_at": None}).publish_at is None
    assert YouTubeMetadata.from_mapping({"title": "t", "publish_at": ""}).publish_at is None


def test_publish_at_aware_input_is_kept_as_utc() -> None:
    when = in_future(hours=2)
    meta = YouTubeMetadata.from_mapping({"title": "t", "publish_at": when})
    assert meta.publish_at == when and meta.publish_at.tzinfo is UTC
    from_string = YouTubeMetadata.from_mapping({"title": "t", "publish_at": when.isoformat()})
    assert from_string.publish_at == when


def test_publish_at_naive_input_is_local_time() -> None:
    local = in_future(hours=2).astimezone().replace(tzinfo=None)
    meta = YouTubeMetadata.from_mapping({"title": "t", "publish_at": local})
    assert meta.publish_at == local.astimezone().astimezone(UTC)
    text = local.strftime("%Y-%m-%d %H:%M")
    from_string = YouTubeMetadata.from_mapping({"title": "t", "publish_at": text})
    assert from_string.publish_at == local.replace(second=0).astimezone().astimezone(UTC)


def test_publish_at_needs_five_minutes_lead() -> None:
    edge = in_future(minutes=6)
    assert YouTubeMetadata.from_mapping({"title": "t", "publish_at": edge}).publish_at == edge
    with pytest.raises(ConfigError, match=r"publish_at .* at least 5 minutes"):
        YouTubeMetadata.from_mapping({"title": "t", "publish_at": in_future(minutes=4)})
    with pytest.raises(ConfigError, match=r"publish_at .* already passed"):
        YouTubeMetadata.from_mapping({"title": "t", "publish_at": in_future(hours=-1)})


@pytest.mark.parametrize("privacy", ["public", "unlisted"])
def test_publish_at_requires_private(privacy: str) -> None:
    with pytest.raises(ConfigError, match="publish_at .* private"):
        YouTubeMetadata.from_mapping(
            {"title": "t", "privacy_status": privacy, "publish_at": in_future(hours=1)}
        )


@pytest.mark.parametrize("value", ["tomorrow", "2026-13-01 10:00", 20261001, True, "2026-10-01"])
def test_publish_at_rejects_unparseable(value: object) -> None:
    with pytest.raises(ConfigError, match="publish_at must be a date and time"):
        YouTubeMetadata.from_mapping({"title": "t", "publish_at": value})


def test_load_from_file_with_publish_at(tmp_path: Path) -> None:
    local = in_future(days=1).astimezone().replace(tzinfo=None, second=0)
    cfg = tmp_path / "config.yaml"
    cfg.write_text(f"youtube:\n  title: Hello\n  publish_at: {local:%Y-%m-%d %H:%M}\n")
    assert load_youtube_metadata(cfg).publish_at == local.astimezone().astimezone(UTC)
