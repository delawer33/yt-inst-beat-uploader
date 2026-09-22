"""``/api/beats``: list, get, cover, privacy."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from beat_server.api import beats as beats_api
from beat_server.db.models import Beat, BeatStatus
from beat_server.db.repo import BeatRepo
from beat_upload.config import PrivacyStatus
from beat_upload.errors import AuthError
from beat_upload.workspace import Workspace

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


@pytest.fixture
def beats(session: Session) -> dict[str, Beat]:
    repo = BeatRepo(session)
    published = repo.add(
        Beat(
            id="pub",
            youtube_id="yt-pub",
            title="Published",
            status=BeatStatus.PUBLISHED,
            privacy="public",
            published_at=datetime(2026, 9, 1),
            created_at=datetime(2026, 1, 1),
            views=1500,
        )
    )
    draft = repo.add(
        Beat(
            id="draft",
            title="Draft",
            status=BeatStatus.DRAFT,
            audio_path="beat.mp3",
            image_path="cover.png",
            created_at=datetime(2026, 8, 1),
        )
    )
    older = repo.add(
        Beat(
            id="old",
            youtube_id="yt-old",
            title="Older",
            status=BeatStatus.UPLOADED,
            privacy="unlisted",
            published_at=datetime(2026, 5, 1),
            created_at=datetime(2026, 2, 1),
        )
    )
    return {"pub": published, "draft": draft, "old": older}


def test_list_newest_first_with_derived_fields(client: TestClient, beats: dict[str, Beat]) -> None:
    response = client.get("/api/beats")
    assert response.status_code == 200
    items = response.json()
    assert [b["id"] for b in items] == ["pub", "draft", "old"]

    pub = items[0]
    assert pub["youtube_url"] == "https://youtu.be/yt-pub"
    assert pub["cover_url"] == "https://i.ytimg.com/vi/yt-pub/hqdefault.jpg"
    assert pub["has_files"] is False
    assert pub["privacy"] == "public" and pub["status"] == "published"
    assert pub["views"] == 1500

    draft = items[1]
    assert draft["youtube_url"] is None
    assert draft["cover_url"] == "/api/beats/draft/cover"
    assert draft["has_files"] is True


def test_get_and_404(client: TestClient, beats: dict[str, Beat]) -> None:
    assert client.get("/api/beats/old").json()["title"] == "Older"
    missing = client.get("/api/beats/nope")
    assert missing.status_code == 404
    assert "nope" in missing.json()["detail"]


def test_cover(client: TestClient, workspace: Workspace, beats: dict[str, Beat]) -> None:
    assert client.get("/api/beats/pub/cover").status_code == 404  # no local file
    assert client.get("/api/beats/draft/cover").status_code == 404  # path set, file missing
    assert client.get("/api/beats/nope/cover").status_code == 404

    cover = workspace.beat_dir("draft") / "cover.png"
    cover.parent.mkdir(parents=True)
    cover.write_bytes(PNG)
    response = client.get("/api/beats/draft/cover")
    assert response.status_code == 200
    assert response.content == PNG
    assert response.headers["content-type"] == "image/png"


def test_set_privacy(
    client: TestClient, session: Session, beats: dict[str, Beat], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[tuple[str, PrivacyStatus]] = []
    monkeypatch.setattr(beats_api, "get_valid_credentials", lambda ws: "creds")
    monkeypatch.setattr(
        beats_api, "set_privacy", lambda vid, status, creds: calls.append((vid, status))
    )

    response = client.post("/api/beats/pub/privacy", json={"privacy": "unlisted"})
    assert response.status_code == 200
    assert calls == [("yt-pub", PrivacyStatus.UNLISTED)]
    body = response.json()
    assert body["privacy"] == "unlisted" and body["status"] == "uploaded"
    session.expire_all()
    beat = BeatRepo(session).get("pub")
    assert beat is not None and beat.privacy == "unlisted"
    assert beat.status == BeatStatus.UPLOADED

    back = client.post("/api/beats/pub/privacy", json={"privacy": "public"}).json()
    assert back["status"] == "published"


def test_set_privacy_rejects_bad_input_and_missing(
    client: TestClient, beats: dict[str, Beat], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(beats_api, "get_valid_credentials", lambda ws: "creds")
    monkeypatch.setattr(beats_api, "set_privacy", lambda *a: None)
    assert client.post("/api/beats/pub/privacy", json={"privacy": "secret"}).status_code == 422
    assert client.post("/api/beats/nope/privacy", json={"privacy": "public"}).status_code == 404


def test_set_privacy_without_youtube_id_is_409(client: TestClient, beats: dict[str, Beat]) -> None:
    response = client.post("/api/beats/draft/privacy", json={"privacy": "public"})
    assert response.status_code == 409
    assert "not on YouTube" in response.json()["detail"]


def test_set_privacy_without_credentials_is_409(
    client: TestClient, beats: dict[str, Beat], monkeypatch: pytest.MonkeyPatch
) -> None:
    def no_creds(ws: Workspace) -> None:
        raise AuthError("Not connected")

    monkeypatch.setattr(beats_api, "get_valid_credentials", no_creds)
    response = client.post("/api/beats/pub/privacy", json={"privacy": "public"})
    assert response.status_code == 409
    assert response.json()["detail"] == "Not connected"
