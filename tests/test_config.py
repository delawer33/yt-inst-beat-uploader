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
