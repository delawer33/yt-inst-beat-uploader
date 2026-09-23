"""``/api/beats``: list, get, cover, privacy."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from beat_server.api import beats as beats_api
from beat_server.db.models import Beat, BeatStatus
from beat_server.db.repo import BeatRepo, JobRepo
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


Call = tuple[str, PrivacyStatus, datetime | None]


def youtube_calls(monkeypatch: pytest.MonkeyPatch) -> list[Call]:
    """Fake credentials and ``set_privacy``; returns the (video, privacy, publish_at) sent."""
    calls: list[Call] = []
    monkeypatch.setattr(beats_api, "get_valid_credentials", lambda ws: "creds")
    monkeypatch.setattr(
        beats_api,
        "set_privacy",
        lambda vid, status, creds, publish_at=None: calls.append((vid, status, publish_at)),
    )
    return calls


def test_set_privacy(
    client: TestClient, session: Session, beats: dict[str, Beat], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = youtube_calls(monkeypatch)

    response = client.post("/api/beats/pub/privacy", json={"privacy": "unlisted"})
    assert response.status_code == 200
    assert calls == [("yt-pub", PrivacyStatus.UNLISTED, None)]
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
    youtube_calls(monkeypatch)
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


LATER = datetime.now(UTC).replace(microsecond=0) + timedelta(days=1)
LATER_ISO = LATER.isoformat().replace("+00:00", "Z")
LATER_NAIVE = LATER.replace(tzinfo=None)


def schedule(client: TestClient, beat_id: str, privacy: str, when: datetime = LATER) -> dict:
    body = {"privacy": privacy, "publish_at": when.isoformat().replace("+00:00", "Z")}
    return client.post(f"/api/beats/{beat_id}/privacy", json=body)


def test_schedule_an_uploaded_beat_sends_private_with_the_time(
    client: TestClient, session: Session, beats: dict[str, Beat], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = youtube_calls(monkeypatch)

    response = schedule(client, "old", "private")

    assert response.status_code == 200, response.text
    assert calls == [("yt-old", PrivacyStatus.PRIVATE, LATER)]
    body = response.json()
    assert body["status"] == "scheduled" and body["privacy"] == "private"
    assert body["publish_at"] == LATER_NAIVE.isoformat()
    session.expire_all()
    beat = BeatRepo(session).get("old")
    assert beat is not None and beat.status == BeatStatus.SCHEDULED
    assert beat.publish_at == LATER_NAIVE


def test_schedule_unlisted_is_sent_as_private(
    client: TestClient, beats: dict[str, Beat], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = youtube_calls(monkeypatch)
    body = schedule(client, "old", "unlisted").json()
    assert calls[0][1] is PrivacyStatus.PRIVATE
    assert body["privacy"] == "private" and body["status"] == "scheduled"


def test_reschedule_replaces_the_time(
    client: TestClient, beats: dict[str, Beat], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = youtube_calls(monkeypatch)
    schedule(client, "old", "private")
    later = LATER + timedelta(days=2)

    body = schedule(client, "old", "private", later).json()

    assert calls[-1] == ("yt-old", PrivacyStatus.PRIVATE, later)
    assert body["status"] == "scheduled"
    assert body["publish_at"] == later.replace(tzinfo=None).isoformat()


def test_private_or_unlisted_clears_the_schedule(
    client: TestClient, beats: dict[str, Beat], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = youtube_calls(monkeypatch)
    schedule(client, "old", "private")

    body = client.post("/api/beats/old/privacy", json={"privacy": "unlisted"}).json()

    assert calls[-1] == ("yt-old", PrivacyStatus.UNLISTED, None)
    assert body["status"] == "uploaded" and body["publish_at"] is None


def test_public_on_a_scheduled_beat_publishes_now(
    client: TestClient, beats: dict[str, Beat], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = youtube_calls(monkeypatch)
    schedule(client, "old", "private")

    body = client.post("/api/beats/old/privacy", json={"privacy": "public"}).json()

    assert calls[-1] == ("yt-old", PrivacyStatus.PUBLIC, None)
    assert body["status"] == "published" and body["publish_at"] is None


def test_schedule_rejects_a_bad_time_without_calling_youtube(
    client: TestClient, beats: dict[str, Beat], monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = youtube_calls(monkeypatch)
    soon = datetime.now(UTC) + timedelta(minutes=1)
    passed = datetime.now(UTC) - timedelta(hours=1)

    assert schedule(client, "old", "private", soon).status_code == 422
    assert "at least" in schedule(client, "old", "private", soon).json()["detail"]
    assert "already passed" in schedule(client, "old", "private", passed).json()["detail"]
    assert schedule(client, "old", "public").status_code == 422
    assert calls == []


PASSED_NAIVE = (datetime.now(UTC) - timedelta(hours=1)).replace(tzinfo=None, microsecond=0)


def stale_draft(session: Session) -> Beat:
    """A draft scheduled for a time that has since passed (the DB keeps naive UTC)."""
    return BeatRepo(session).add(
        Beat(
            id="stale",
            title="Stale",
            status=BeatStatus.DRAFT,
            privacy="private",
            publish_at=PASSED_NAIVE,
            audio_path="beat.mp3",
            image_path="cover.png",
        )
    )


def test_patch_of_other_fields_keeps_a_stale_publish_at(
    client: TestClient, session: Session
) -> None:
    stale_draft(session)

    response = client.patch("/api/beats/stale", json={"title": "Renamed"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["title"] == "Renamed"
    assert body["publish_at"] == PASSED_NAIVE.isoformat()


def test_patch_touching_the_schedule_still_validates_it(
    client: TestClient, session: Session
) -> None:
    stale_draft(session)

    response = client.patch("/api/beats/stale", json={"privacy": "private"})

    assert response.status_code == 422
    assert "already passed" in response.json()["detail"]
    assert client.patch("/api/beats/stale", json={"publish_at": None}).status_code == 200


def test_upload_with_a_passed_publish_at_is_422_and_queues_nothing(
    client: TestClient, session: Session
) -> None:
    stale_draft(session)

    response = client.post("/api/beats/stale/upload")

    assert response.status_code == 422
    assert "already passed" in response.json()["detail"]
    session.expire_all()
    assert BeatRepo(session).get("stale").status == BeatStatus.DRAFT
    assert JobRepo(session).list() == []
