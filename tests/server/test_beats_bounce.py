"""``POST /api/beats/from-folder``: a Draft read in place from a Bounce Folder (ADR 0007)."""

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from beat_server.db.models import JobKind
from beat_server.db.repo import BeatRepo, JobRepo
from beat_upload.workspace import Workspace


def bounce(root: Path, name: str = "Jungle_104bpm_Amin_calm_guitar-808_smp", **skip: bool) -> Path:
    folder = root / name
    folder.mkdir()
    for f in ("master.wav", "tagged.mp3", "cover.png"):
        if not skip.get(f.split(".")[1]):
            (folder / f).write_bytes(b"x")
    return folder


def test_creates_a_draft_in_place_and_queues_the_render(
    client: TestClient, session: Session, workspace: Workspace, tmp_path: Path
) -> None:
    folder = bounce(tmp_path)
    response = client.post("/api/beats/from-folder", json={"path": f" {folder} "})
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft" and body["has_files"] is True
    assert body["active_job"]["kind"] == "render"
    assert body["beatstars"]["moods"] == [] and body["beatstars"]["samples"] is True

    beat = BeatRepo(session).get(body["id"])
    assert beat is not None
    assert beat.audio_path == str(folder / "tagged.mp3")
    assert beat.image_path == str(folder / "cover.png")
    assert (beat.bpm, beat.music_key) == (104, "Amin")
    assert beat.name_moods == ["calm"] and beat.name_instruments == ["guitar", "808"]
    assert workspace.beat_dir(beat.id).is_dir()  # the video goes here; the folder is untouched
    assert sorted(p.name for p in folder.iterdir()) == ["cover.png", "master.wav", "tagged.mp3"]
    assert JobRepo(session).has_pending(JobKind.RENDER, beat.id)


def test_cover_is_served_from_the_folder(client: TestClient, tmp_path: Path) -> None:
    beat_id = client.post("/api/beats/from-folder", json={"path": str(bounce(tmp_path))}).json()[
        "id"
    ]
    cover = client.get(f"/api/beats/{beat_id}/cover")
    assert cover.status_code == 200 and cover.content == b"x"


def test_a_folder_without_its_wav_is_refused_and_leaves_no_row(
    client: TestClient, session: Session, tmp_path: Path
) -> None:
    response = client.post("/api/beats/from-folder", json={"path": str(bounce(tmp_path, wav=True))})
    assert response.status_code == 422
    assert "WAV" in response.json()["detail"]
    assert BeatRepo(session).list() == []


def test_a_folder_with_no_bpm_or_key_is_refused(client: TestClient, tmp_path: Path) -> None:
    response = client.post("/api/beats/from-folder", json={"path": str(bounce(tmp_path, "Jungle"))})
    assert response.status_code == 422
    assert "BPM and key" in response.json()["detail"]


def test_a_missing_or_relative_path_is_refused(client: TestClient, tmp_path: Path) -> None:
    assert (
        client.post("/api/beats/from-folder", json={"path": str(tmp_path / "x")}).status_code == 422
    )
    assert client.post("/api/beats/from-folder", json={"path": "Jungle"}).status_code == 422


TITLE = '[FREE] Yeat x Playboi Carti Type Beat 2026 - "Naughty" | Melodic Guitar Trap'


def make_beat(client: TestClient, tmp_path: Path) -> str:
    return client.post("/api/beats/from-folder", json={"path": str(bounce(tmp_path))}).json()["id"]


def test_the_preview_is_built_from_the_title_the_way_the_old_tracks_were(
    client: TestClient, tmp_path: Path
) -> None:
    beat_id = make_beat(client, tmp_path)
    body = client.patch(f"/api/beats/{beat_id}", json={"title": TITLE, "privacy": "public"}).json()
    preview = body["beatstars"]
    assert preview["error"] is None
    assert preview["title"] == "Naughty | Yeat x Playboi Carti Type Beat"
    assert preview["tags"] == ["yeat type beat", "playboi carti type beat", "melodic guitar trap"]
    assert preview["genres"] == ["Trap", "Hip Hop"]
    # Fill never ran: the exact word of the name, and the substyle tops moods up
    assert preview["moods"] == ["Calm", "Sad", "Melancholy"]
    assert preview["instruments"] == ["Guitar"]
    assert preview["samples"] is True and preview["release"] == "with_video"


def test_a_title_that_does_not_read_is_an_error_in_the_preview_not_a_failed_request(
    client: TestClient, tmp_path: Path
) -> None:
    beat_id = make_beat(client, tmp_path)
    response = client.get(f"/api/beats/{beat_id}")
    assert response.status_code == 200
    preview = response.json()["beatstars"]
    assert "Type Beat" in preview["error"]
    assert preview["title"] == "" and preview["tags"] == [] and preview["genres"] == []


def test_the_release_follows_privacy_and_schedule(client: TestClient, tmp_path: Path) -> None:
    beat_id = make_beat(client, tmp_path)

    def release(**patch: object) -> str:
        body = client.patch(f"/api/beats/{beat_id}", json={"title": TITLE} | patch).json()
        return body["beatstars"]["release"]

    assert release(privacy="private") == "skipped_private"
    assert release(privacy="unlisted") == "skipped_private"
    assert release(privacy="public") == "with_video"
    assert release(privacy="private", publish_at="2999-01-01T12:00:00") == "with_video"


def test_moods_and_instruments_are_saved_spelled_as_beatstars_spells_them(
    client: TestClient, session: Session, tmp_path: Path
) -> None:
    beat_id = make_beat(client, tmp_path)
    response = client.patch(
        f"/api/beats/{beat_id}",
        json={
            "title": TITLE,
            "beatstars_moods": ["calm", "SAD"],
            "beatstars_instruments": ["acoustic guitar"],
        },
    )
    assert response.status_code == 200, response.text
    preview = response.json()["beatstars"]
    assert preview["moods"] == ["Calm", "Sad"] and preview["instruments"] == ["Acoustic guitar"]
    session.expire_all()
    beat = BeatRepo(session).get(beat_id)
    assert beat is not None and beat.beatstars_moods == ["Calm", "Sad"]


def test_a_mood_outside_the_list_is_422(client: TestClient, tmp_path: Path) -> None:
    beat_id = make_beat(client, tmp_path)
    response = client.patch(
        f"/api/beats/{beat_id}", json={"title": TITLE, "beatstars_moods": ["rhytmic"]}
    )
    assert response.status_code == 422
    assert "rhytmic" in response.json()["detail"]
    response = client.patch(
        f"/api/beats/{beat_id}", json={"title": TITLE, "beatstars_instruments": ["808"]}
    )
    assert response.status_code == 422
