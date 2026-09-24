"""New Beat: create a draft from files, edit its metadata, render and upload it."""

import asyncio
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path

import pytest
from fastapi import FastAPI, UploadFile
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from beat_server.api.schemas import BeatPatch
from beat_server.db.models import Beat, BeatStatus, Job, JobKind, JobStatus
from beat_server.db.repo import BeatRepo, JobRepo, SettingsRepo
from beat_server.jobs.events import Event
from beat_server.jobs.handlers import HANDLERS
from beat_server.jobs.queue import CANCELLED_ERROR
from beat_server.jobs.worker import MAX_ATTEMPTS, JobContext, Worker
from beat_server.services import beats as beats_service
from beat_server.services import pipeline
from beat_server.services.beats import (
    apply_patch,
    create_draft,
    default_metadata,
    delete_draft,
    metadata_of,
)
from beat_server.services.errors import BeatStateError
from beat_upload.config import PrivacyStatus, YouTubeMetadata
from beat_upload.errors import AuthError, BeatFolderError, ConfigError, NetworkError, VideoError
from beat_upload.workspace import Workspace

MP3 = b"ID3" + b"\x00" * 32
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def upload(name: str, data: bytes) -> UploadFile:
    return UploadFile(BytesIO(data), filename=name)


@pytest.fixture
def repo(session: Session) -> BeatRepo:
    return BeatRepo(session)


@pytest.fixture
def template() -> dict:
    return {
        "title_template": '[FREE] Trap Type Beat - "{name}"',
        "description_template": "{name} prod. by me",
        "tags_template": ["trap", "free"],
    }


@pytest.fixture
def draft(workspace: Workspace, repo: BeatRepo, template: dict) -> Beat:
    return create_draft(
        workspace, repo, upload("Dark Night.mp3", MP3), upload("c.png", PNG), template
    )


# --- create_draft -------------------------------------------------------------------------


def test_create_draft_stores_files_and_applies_template(workspace: Workspace, draft: Beat) -> None:
    beat_dir = workspace.beat_dir(draft.id)
    assert (beat_dir / "audio.mp3").read_bytes() == MP3
    assert (beat_dir / "cover.png").read_bytes() == PNG
    assert (draft.audio_path, draft.image_path, draft.video_path) == (
        "audio.mp3",
        "cover.png",
        None,
    )
    assert draft.status == BeatStatus.DRAFT
    assert draft.title == '[FREE] Trap Type Beat - "Dark Night"'
    assert draft.description == "Dark Night prod. by me"
    assert draft.tags == ["trap", "free"]
    assert draft.privacy == "private"


def test_create_draft_rejects_two_audio_files(workspace: Workspace, repo: BeatRepo) -> None:
    with pytest.raises(BeatFolderError, match=r"Expected an image file .* got second\.mp3"):
        create_draft(workspace, repo, upload("a.mp3", MP3), upload("second.mp3", MP3), {})
    assert repo.list() == []
    assert not (workspace.data_dir / "beats").exists()


def test_create_draft_rejects_unknown_extension(workspace: Workspace, repo: BeatRepo) -> None:
    with pytest.raises(BeatFolderError, match=r"Expected an audio file .* got a\.flac"):
        create_draft(workspace, repo, upload("a.flac", MP3), upload("c.png", PNG), {})


def test_create_draft_defaults_without_template(workspace: Workspace, repo: BeatRepo) -> None:
    beat = create_draft(workspace, repo, upload("beat.WAV", MP3), upload("c.JPG", PNG), {})
    assert beat.title == "beat" and beat.description == "" and beat.tags == []
    assert (beat.audio_path, beat.image_path) == ("audio.wav", "cover.jpg")


def test_default_metadata(session: Session) -> None:
    settings = SettingsRepo(session)
    assert default_metadata(settings) == {
        "title_template": "{name}",
        "description_template": "",
        "tags_template": [],
    }
    beats_service.save_templates(settings, title="[FREE] {name}", tags=["trap"])
    assert default_metadata(settings)["title_template"] == "[FREE] {name}"
    assert default_metadata(settings)["tags_template"] == ["trap"]
    settings.set("tags_template", "not json")
    assert default_metadata(settings)["tags_template"] == []


# --- apply_patch / metadata_of -------------------------------------------------------------


def test_apply_patch_merges_and_validates(draft: Beat) -> None:
    apply_patch(draft, BeatPatch(title="New", privacy=PrivacyStatus.PUBLIC))
    assert draft.title == "New" and draft.privacy == "public"
    assert draft.tags == ["trap", "free"]  # untouched
    with pytest.raises(ConfigError, match="title must be <= 100"):
        apply_patch(draft, BeatPatch(title="x" * 101))
    with pytest.raises(ConfigError, match="tags must be <= 500"):
        apply_patch(draft, BeatPatch(tags=["a" * 501]))
    assert draft.title == "New"  # a failed patch changes nothing


def test_apply_patch_publish_at(draft: Beat) -> None:
    when = datetime.now(UTC).replace(microsecond=0) + timedelta(days=1)
    apply_patch(draft, BeatPatch(privacy=PrivacyStatus.PRIVATE, publish_at=when))
    assert draft.publish_at == when.replace(tzinfo=None)  # naive UTC like every column
    assert metadata_of(draft).publish_at == when

    apply_patch(draft, BeatPatch(title="Still scheduled"))  # untouched when not sent
    assert draft.publish_at == when.replace(tzinfo=None)
    with pytest.raises(ConfigError, match="publish_at .* private"):
        apply_patch(draft, BeatPatch(privacy=PrivacyStatus.PUBLIC))
    with pytest.raises(ConfigError, match="at least 5 minutes"):
        apply_patch(draft, BeatPatch(publish_at=datetime.now(UTC) + timedelta(minutes=1)))

    apply_patch(draft, BeatPatch(publish_at=None))  # explicit null clears
    assert draft.publish_at is None and metadata_of(draft).publish_at is None


def test_metadata_of(draft: Beat) -> None:
    assert metadata_of(draft) == YouTubeMetadata(
        title='[FREE] Trap Type Beat - "Dark Night"',
        description="Dark Night prod. by me",
        tags=["trap", "free"],
        privacy_status=PrivacyStatus.PRIVATE,
    )


# --- delete_draft --------------------------------------------------------------------------


def test_delete_draft_removes_dir_and_row(
    workspace: Workspace, repo: BeatRepo, draft: Beat
) -> None:
    delete_draft(workspace, repo, draft)
    assert not workspace.beat_dir(draft.id).exists()
    assert repo.get(draft.id) is None


def test_delete_draft_refuses_uploaded(workspace: Workspace, repo: BeatRepo, draft: Beat) -> None:
    draft.status = BeatStatus.UPLOADED
    repo.save(draft)
    with pytest.raises(BeatStateError):
        delete_draft(workspace, repo, draft)
    assert workspace.beat_dir(draft.id).is_dir()


# --- handlers ------------------------------------------------------------------------------


def make_worker(app: FastAPI) -> Worker:
    return Worker(
        app.state.queue, HANDLERS, app.state.session_factory, app.state.workspace, app.state.bus
    )


def reload_job(session: Session, job: Job) -> Job:
    session.expire_all()
    return JobRepo(session).get(job.id)  # type: ignore[return-value]


def reload_beat(session: Session, beat: Beat) -> Beat:
    session.expire_all()
    return BeatRepo(session).get(beat.id)  # type: ignore[return-value]


@pytest.fixture
def beat_events(app: FastAPI) -> list[tuple[str, str]]:
    seen: list[tuple[str, str]] = []
    original = app.state.bus.publish

    def spy(event: Event) -> None:
        if event.type == "beat":
            seen.append((event.payload["id"], event.payload["status"]))
        original(event)

    app.state.bus.publish = spy
    return seen


async def test_run_render_on_a_draft_renders_and_enqueues_nothing(
    app: FastAPI,
    session: Session,
    workspace: Workspace,
    draft: Beat,
    monkeypatch: pytest.MonkeyPatch,
    beat_events: list[tuple[str, str]],
) -> None:
    """The Render started by the drop leaves a Rendered Draft: no status change, no UPLOAD."""
    calls: list[tuple[Path, Path, Path]] = []

    def fake_render(audio: Path, image: Path, output: Path, on_progress) -> Path:  # noqa: ANN001
        calls.append((audio, image, output))
        on_progress(0.5)
        output.write_bytes(b"mp4")
        return output

    monkeypatch.setattr(pipeline, "render_video", fake_render)
    job = app.state.queue.enqueue(JobKind.RENDER, draft.id)
    await make_worker(app).run_one(job)

    beat_dir = workspace.beat_dir(draft.id)
    assert calls == [(beat_dir / "audio.mp3", beat_dir / "cover.png", beat_dir / "video.mp4")]
    job = reload_job(session, job)
    assert job.status == JobStatus.DONE, job.error
    beat = reload_beat(session, draft)
    assert beat.video_path == "video.mp4"
    assert beat.status == BeatStatus.DRAFT  # the owner has not sent it yet
    assert beat_events == [(draft.id, "draft")]  # the Library hears the beat is now Rendered
    assert JobRepo(session).next_queued() is None
    assert (beat_dir / "video.mp4").is_file()


async def test_run_render_on_a_sent_beat_enqueues_upload(
    app: FastAPI,
    session: Session,
    repo: BeatRepo,
    draft: Beat,
    monkeypatch: pytest.MonkeyPatch,
    beat_events: list[tuple[str, str]],
) -> None:
    """The owner sent the beat while ffmpeg ran: the Render enqueues the UPLOAD behind it."""

    def fake_render(audio: Path, image: Path, output: Path, on_progress) -> Path:  # noqa: ANN001
        output.write_bytes(b"mp4")
        return output

    monkeypatch.setattr(pipeline, "render_video", fake_render)
    draft.status = BeatStatus.QUEUED
    repo.save(draft)
    job = app.state.queue.enqueue(JobKind.RENDER, draft.id)
    await make_worker(app).run_one(job)

    assert reload_job(session, job).status == JobStatus.DONE
    assert reload_beat(session, draft).status == BeatStatus.QUEUED
    assert beat_events == [(draft.id, "queued")]
    follow_up = JobRepo(session).next_queued()
    assert follow_up is not None
    assert (follow_up.kind, follow_up.beat_id) == (JobKind.UPLOAD, draft.id)


async def test_run_render_progress_reaches_job(
    app: FastAPI, session: Session, draft: Beat, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[float] = []
    bus = app.state.bus
    original = bus.publish

    def spy(event: Event) -> None:
        if event.type == "job":
            seen.append(event.payload["progress"])
        original(event)

    bus.publish = spy

    def fake_render(audio: Path, image: Path, output: Path, on_progress) -> Path:  # noqa: ANN001
        on_progress(0.25)
        on_progress(0.75)
        output.write_bytes(b"mp4")
        return output

    monkeypatch.setattr(pipeline, "render_video", fake_render)
    job = app.state.queue.enqueue(JobKind.RENDER, draft.id)
    await make_worker(app).run_one(job)
    assert [p for p in seen if p in (0.25, 0.75)] == [0.25, 0.75]


async def test_run_render_failure_leaves_the_draft_a_draft(
    app: FastAPI, session: Session, draft: Beat, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The failure lives on the Job (ADR 0004); the Beat's status is the owner's, untouched."""

    def fake_render(*args, **kwargs) -> Path:  # noqa: ANN002, ANN003
        raise VideoError("ffmpeg failed")

    monkeypatch.setattr(pipeline, "render_video", fake_render)
    job = app.state.queue.enqueue(JobKind.RENDER, draft.id)
    await make_worker(app).run_one(job)
    job = reload_job(session, job)
    assert job.status == JobStatus.FAILED and job.error == "ffmpeg failed"
    beat = reload_beat(session, draft)
    assert beat.status == BeatStatus.DRAFT and beat.video_path is None
    assert JobRepo(session).next_queued() is None


async def test_run_render_refuses_uploaded_beat(
    app: FastAPI, session: Session, repo: BeatRepo, draft: Beat
) -> None:
    draft.status = BeatStatus.UPLOADED
    repo.save(draft)
    job = app.state.queue.enqueue(JobKind.RENDER, draft.id)
    await make_worker(app).run_one(job)
    job = reload_job(session, job)
    assert job.status == JobStatus.FAILED and "only drafts" in (job.error or "")


async def test_run_render_missing_beat_fails(app: FastAPI, session: Session) -> None:
    job = app.state.queue.enqueue(JobKind.RENDER, "nope")
    await make_worker(app).run_one(job)
    assert reload_job(session, job).status == JobStatus.FAILED


@pytest.fixture
def rendered(workspace: Workspace, repo: BeatRepo, draft: Beat) -> Beat:
    (workspace.beat_dir(draft.id) / "video.mp4").write_bytes(b"mp4")
    draft.video_path = "video.mp4"
    draft.status = BeatStatus.QUEUED
    return repo.save(draft)


TOMORROW = (datetime.now(UTC) + timedelta(days=1)).replace(microsecond=0, tzinfo=None)


@pytest.mark.parametrize(
    ("privacy", "publish_at", "expected"),
    [
        ("public", None, BeatStatus.PUBLISHED),
        ("private", None, BeatStatus.UPLOADED),
        ("private", TOMORROW, BeatStatus.SCHEDULED),
    ],
)
async def test_run_upload_sets_youtube_id_and_status(
    app: FastAPI,
    session: Session,
    workspace: Workspace,
    repo: BeatRepo,
    rendered: Beat,
    monkeypatch: pytest.MonkeyPatch,
    beat_events: list[tuple[str, str]],
    privacy: str,
    publish_at: datetime | None,
    expected: BeatStatus,
) -> None:
    rendered.privacy = privacy
    rendered.publish_at = publish_at
    repo.save(rendered)
    calls: list[tuple[Path, YouTubeMetadata, object]] = []

    def fake_upload(video: Path, metadata: YouTubeMetadata, creds: object, on_progress) -> str:  # noqa: ANN001
        calls.append((video, metadata, creds))
        on_progress(0.5)
        return "yt-new"

    monkeypatch.setattr(pipeline, "upload_video", fake_upload)
    monkeypatch.setattr(JobContext, "credentials", lambda self: "creds")
    job = app.state.queue.enqueue(JobKind.UPLOAD, rendered.id)
    await make_worker(app).run_one(job)

    assert reload_job(session, job).status == JobStatus.DONE
    beat = reload_beat(session, rendered)
    assert beat.youtube_id == "yt-new"
    assert beat.status == expected
    assert beat.published_at is not None
    assert calls[0][0] == workspace.beat_dir(beat.id) / "video.mp4"
    assert calls[0][1].privacy_status == PrivacyStatus(privacy)
    expected_publish_at = publish_at.replace(tzinfo=UTC) if publish_at else None
    assert calls[0][1].publish_at == expected_publish_at
    assert calls[0][2] == "creds"
    assert beat_events == [(beat.id, "uploading"), (beat.id, expected.value)]


async def test_run_upload_with_passed_publish_at_fails_and_returns_to_draft(
    app: FastAPI, session: Session, repo: BeatRepo, rendered: Beat, monkeypatch: pytest.MonkeyPatch
) -> None:
    passed = datetime(2026, 9, 1, 15, 0)
    rendered.publish_at = passed
    repo.save(rendered)
    monkeypatch.setattr(pipeline, "upload_video", lambda *a: pytest.fail("must not upload"))
    monkeypatch.setattr(JobContext, "credentials", lambda self: "creds")

    job = app.state.queue.enqueue(JobKind.UPLOAD, rendered.id)
    await make_worker(app).run_one(job)

    job = reload_job(session, job)
    shown = passed.replace(tzinfo=UTC).astimezone().strftime("%Y-%m-%d %H:%M")
    assert job.status == JobStatus.FAILED
    assert job.error == f"youtube.publish_at ({shown}) has already passed; pick a new time"
    beat = reload_beat(session, rendered)
    assert beat.status == BeatStatus.DRAFT and beat.youtube_id is None
    assert beat.publish_at == passed  # never silently moved


async def test_run_upload_without_credentials_pauses(
    app: FastAPI, session: Session, rendered: Beat, monkeypatch: pytest.MonkeyPatch
) -> None:
    def no_creds(self: JobContext) -> None:
        raise AuthError("Not connected")

    monkeypatch.setattr(JobContext, "credentials", no_creds)
    monkeypatch.setattr(pipeline, "upload_video", lambda *a: pytest.fail("must not upload"))
    job = app.state.queue.enqueue(JobKind.UPLOAD, rendered.id)
    await make_worker(app).run_one(job)
    job = reload_job(session, job)
    assert job.status == JobStatus.PAUSED and job.error == "Not connected"
    beat = reload_beat(session, rendered)
    assert beat.status == BeatStatus.QUEUED and beat.youtube_id is None


async def test_run_upload_network_error_keeps_beat_queued_for_retry(
    app: FastAPI, session: Session, rendered: Beat, monkeypatch: pytest.MonkeyPatch
) -> None:
    def offline(*a: object) -> str:
        raise NetworkError("Could not reach YouTube")

    monkeypatch.setattr(pipeline, "upload_video", offline)
    monkeypatch.setattr(JobContext, "credentials", lambda self: "creds")
    job = app.state.queue.enqueue(JobKind.UPLOAD, rendered.id)
    await make_worker(app).run_one(job)
    job = reload_job(session, job)
    assert job.status == JobStatus.QUEUED and job.attempts == 1
    assert reload_beat(session, rendered).status == BeatStatus.QUEUED


async def test_run_upload_network_error_on_last_attempt_returns_to_draft(
    app: FastAPI, session: Session, rendered: Beat, monkeypatch: pytest.MonkeyPatch
) -> None:
    def offline(*a: object) -> str:
        raise NetworkError("Could not reach YouTube")

    monkeypatch.setattr(pipeline, "upload_video", offline)
    monkeypatch.setattr(JobContext, "credentials", lambda self: "creds")
    job = app.state.queue.enqueue(JobKind.UPLOAD, rendered.id)
    job.attempts = MAX_ATTEMPTS - 1
    JobRepo(session).save(job)
    await make_worker(app).run_one(job)
    assert reload_job(session, job).status == JobStatus.FAILED
    assert reload_beat(session, rendered).status == BeatStatus.DRAFT


async def test_run_upload_credentials_network_error_follows_the_same_rules(
    app: FastAPI, session: Session, rendered: Beat, monkeypatch: pytest.MonkeyPatch
) -> None:
    def offline(self: JobContext) -> None:
        raise NetworkError("Could not reach Google to refresh credentials")

    monkeypatch.setattr(JobContext, "credentials", offline)
    monkeypatch.setattr(pipeline, "upload_video", lambda *a: pytest.fail("must not upload"))
    job = app.state.queue.enqueue(JobKind.UPLOAD, rendered.id)
    job.attempts = MAX_ATTEMPTS - 1
    JobRepo(session).save(job)
    await make_worker(app).run_one(job)
    assert reload_job(session, job).status == JobStatus.FAILED
    assert reload_beat(session, rendered).status == BeatStatus.DRAFT


async def test_run_upload_without_video_fails(
    app: FastAPI, session: Session, draft: Beat, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(JobContext, "credentials", lambda self: "creds")
    job = app.state.queue.enqueue(JobKind.UPLOAD, draft.id)
    await make_worker(app).run_one(job)
    job = reload_job(session, job)
    assert job.status == JobStatus.FAILED and "no rendered video" in (job.error or "")


async def test_run_upload_refuses_already_uploaded(
    app: FastAPI, session: Session, repo: BeatRepo, rendered: Beat, monkeypatch: pytest.MonkeyPatch
) -> None:
    rendered.youtube_id = "yt-old"
    repo.save(rendered)
    job = app.state.queue.enqueue(JobKind.UPLOAD, rendered.id)
    await make_worker(app).run_one(job)
    assert reload_job(session, job).status == JobStatus.FAILED


def test_handlers_registered() -> None:
    assert HANDLERS[JobKind.RENDER] is pipeline.run_render
    assert HANDLERS[JobKind.UPLOAD] is pipeline.run_upload


# --- API -----------------------------------------------------------------------------------


def post_beat(client: TestClient, audio: tuple[str, bytes], image: tuple[str, bytes]):  # noqa: ANN201
    return client.post(
        "/api/beats",
        files={
            "audio": (audio[0], BytesIO(audio[1]), "application/octet-stream"),
            "image": (image[0], BytesIO(image[1]), "application/octet-stream"),
        },
    )


def test_post_beats_creates_draft(client: TestClient, workspace: Workspace) -> None:
    response = post_beat(client, ("My Beat.mp3", MP3), ("cover.png", PNG))
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "draft" and body["title"] == "My Beat"
    assert body["has_files"] is True
    assert body["cover_url"] == f"/api/beats/{body['id']}/cover"
    assert client.get(body["cover_url"]).content == PNG
    assert (workspace.beat_dir(body["id"]) / "audio.mp3").is_file()
    assert client.get("/api/beats").json()[0]["id"] == body["id"]


def test_post_beats_uses_saved_templates(client: TestClient) -> None:
    put = client.put(
        "/api/settings",
        json={"stats_hour": 4, "title_template": "[FREE] {name} | Trap", "tags_template": ["t"]},
    )
    assert put.status_code == 200
    assert put.json()["title_template"] == "[FREE] {name} | Trap"
    assert put.json()["tags_template"] == ["t"]
    assert client.get("/api/settings").json()["description_template"] == ""
    body = post_beat(client, ("Night.mp3", MP3), ("c.jpg", PNG)).json()
    assert body["title"] == "[FREE] Night | Trap" and body["tags"] == ["t"]


def test_post_beats_rejects_bad_files(client: TestClient) -> None:
    two_audio = post_beat(client, ("a.mp3", MP3), ("b.mp3", MP3))
    assert two_audio.status_code == 400
    assert "Expected an image file" in two_audio.json()["detail"]
    assert client.post("/api/beats", files={"audio": ("a.mp3", BytesIO(MP3))}).status_code == 422


def test_patch_beat(client: TestClient, session: Session, draft: Beat) -> None:
    ok = client.patch(f"/api/beats/{draft.id}", json={"title": "Edited", "tags": ["x", "y"]})
    assert ok.status_code == 200, ok.text
    assert ok.json()["title"] == "Edited" and ok.json()["tags"] == ["x", "y"]
    assert ok.json()["privacy"] == "private"

    scheduled = client.patch(
        f"/api/beats/{draft.id}",
        json={"privacy": "private", "publish_at": f"{TOMORROW.isoformat()}Z"},
    )
    assert scheduled.status_code == 200, scheduled.text
    assert scheduled.json()["publish_at"] == TOMORROW.isoformat()
    assert client.get(f"/api/beats/{draft.id}").json()["publish_at"] == TOMORROW.isoformat()
    cleared = client.patch(f"/api/beats/{draft.id}", json={"publish_at": None})
    assert cleared.status_code == 200 and cleared.json()["publish_at"] is None

    too_long = client.patch(f"/api/beats/{draft.id}", json={"title": "x" * 101})
    assert too_long.status_code == 422
    assert "title must be <= 100" in too_long.json()["detail"]
    assert client.patch("/api/beats/nope", json={"title": "x"}).status_code == 404
    assert client.patch(f"/api/beats/{draft.id}", json={"privacy": "secret"}).status_code == 422


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ({"privacy": "public", "publish_at": f"{TOMORROW.isoformat()}Z"}, "only allowed with"),
        ({"publish_at": "2026-09-01T15:00:00Z"}, "already passed"),
        ({"publish_at": "tomorrow"}, None),  # pydantic rejects it before our validator
    ],
)
def test_patch_beat_rejects_bad_publish_at(
    client: TestClient, draft: Beat, body: dict, message: str | None
) -> None:
    response = client.patch(f"/api/beats/{draft.id}", json=body)
    assert response.status_code == 422, response.text
    if message is not None:
        assert message in response.json()["detail"]
    assert client.get(f"/api/beats/{draft.id}").json()["publish_at"] is None


def test_patch_uploaded_beat_is_409(client: TestClient, repo: BeatRepo, draft: Beat) -> None:
    draft.status = BeatStatus.UPLOADED
    repo.save(draft)
    response = client.patch(f"/api/beats/{draft.id}", json={"title": "Edited"})
    assert response.status_code == 409


def test_send_queues_the_beat_and_a_render_when_there_is_no_video(
    client: TestClient, session: Session, draft: Beat, beat_events: list[tuple[str, str]]
) -> None:
    response = client.post(f"/api/beats/{draft.id}/upload")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "queued" and body["rendered"] is False
    assert body["active_job"]["kind"] == "render"
    assert client.get(f"/api/beats/{draft.id}").json()["status"] == "queued"
    assert beat_events == [(draft.id, "queued")]
    assert [j.kind for j in JobRepo(session).for_beat(draft.id)] == [JobKind.RENDER]
    assert client.post(f"/api/beats/{draft.id}/upload").status_code == 409  # not a draft anymore


def test_upload_endpoint_without_files_is_409(client: TestClient, repo: BeatRepo) -> None:
    repo.add(Beat(id="nofiles", title="x", status=BeatStatus.DRAFT))
    response = client.post("/api/beats/nofiles/upload")
    assert response.status_code == 409
    assert "no audio or cover" in response.json()["detail"]
    assert client.post("/api/beats/nope/upload").status_code == 404


def test_delete_endpoint(
    client: TestClient, workspace: Workspace, repo: BeatRepo, draft: Beat
) -> None:
    assert client.delete(f"/api/beats/{draft.id}").status_code == 204
    assert not workspace.beat_dir(draft.id).exists()
    assert client.get(f"/api/beats/{draft.id}").status_code == 404
    assert client.delete("/api/beats/nope").status_code == 404

    uploaded = repo.add(Beat(id="up", title="x", status=BeatStatus.UPLOADED, youtube_id="y"))
    assert client.delete(f"/api/beats/{uploaded.id}").status_code == 409


async def test_full_chain_render_then_upload(
    app: FastAPI, client: TestClient, session: Session, draft: Beat, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Upload click -> RENDER -> UPLOAD -> published, driven with run_one twice."""

    def fake_render(audio: Path, image: Path, output: Path, on_progress) -> Path:  # noqa: ANN001
        output.write_bytes(b"mp4")
        return output

    monkeypatch.setattr(pipeline, "render_video", fake_render)
    monkeypatch.setattr(pipeline, "upload_video", lambda v, m, c, p: "yt-chain")
    monkeypatch.setattr(JobContext, "credentials", lambda self: "creds")
    client.patch(f"/api/beats/{draft.id}", json={"privacy": "public"})
    client.post(f"/api/beats/{draft.id}/upload")

    worker = make_worker(app)
    for _ in range(2):
        with app.state.session_factory() as s:
            job = JobRepo(s).next_queued()
        assert job is not None
        await worker.run_one(job)
    await asyncio.sleep(0)

    body = client.get(f"/api/beats/{draft.id}").json()
    assert body["status"] == "published" and body["youtube_url"] == "https://youtu.be/yt-chain"
    assert [j["status"] for j in client.get("/api/jobs", params={"beat_id": draft.id}).json()] == [
        "done",
        "done",
    ]


# --- ADR 0004: the Render starts on the Draft, the status is the owner's action -------------


async def test_run_render_failure_leaves_a_sent_beat_queued_and_retry_works(
    app: FastAPI,
    client: TestClient,
    session: Session,
    repo: BeatRepo,
    draft: Beat,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A Queued beat stays Queued when its Render fails; retrying the Job finishes the flow."""
    draft.status = BeatStatus.QUEUED
    repo.save(draft)

    def broken_render(*args, **kwargs) -> Path:  # noqa: ANN002, ANN003
        raise VideoError("ffmpeg failed")

    monkeypatch.setattr(pipeline, "render_video", broken_render)
    job = app.state.queue.enqueue(JobKind.RENDER, draft.id)
    await make_worker(app).run_one(job)
    assert reload_job(session, job).status == JobStatus.FAILED
    assert reload_beat(session, draft).status == BeatStatus.QUEUED

    body = client.get(f"/api/beats/{draft.id}").json()
    assert body["rendered"] is False and body["active_job"] is None

    def good_render(audio: Path, image: Path, output: Path, on_progress) -> Path:  # noqa: ANN001
        output.write_bytes(b"mp4")
        return output

    monkeypatch.setattr(pipeline, "render_video", good_render)
    retried = client.post(f"/api/jobs/{job.id}/retry").json()
    assert retried["kind"] == "render" and retried["status"] == "queued"
    with app.state.session_factory() as s:
        next_job = JobRepo(s).next_queued()
    assert next_job is not None
    await make_worker(app).run_one(next_job)

    beat = reload_beat(session, draft)
    assert beat.status == BeatStatus.QUEUED and beat.video_path == "video.mp4"
    assert JobRepo(session).has_pending(JobKind.UPLOAD, beat.id)


def test_post_beats_queues_a_render_and_no_upload(client: TestClient, session: Session) -> None:
    body = post_beat(client, ("My Beat.mp3", MP3), ("cover.png", PNG)).json()
    assert body["status"] == "draft" and body["rendered"] is False
    assert body["active_job"]["kind"] == "render"
    assert body["active_job"]["status"] == "queued"
    assert [j.kind for j in JobRepo(session).for_beat(body["id"])] == [JobKind.RENDER]
    assert client.get("/api/beats").json()[0]["active_job"]["id"] == body["active_job"]["id"]


def test_send_a_rendered_draft_enqueues_the_upload_at_once(
    client: TestClient, session: Session, workspace: Workspace, repo: BeatRepo, draft: Beat
) -> None:
    (workspace.beat_dir(draft.id) / "video.mp4").write_bytes(b"mp4")
    draft.video_path = "video.mp4"
    repo.save(draft)
    assert client.get(f"/api/beats/{draft.id}").json()["rendered"] is True

    body = client.post(f"/api/beats/{draft.id}/upload").json()
    assert body["status"] == "queued"
    assert body["active_job"]["kind"] == "upload"
    assert [j.kind for j in JobRepo(session).for_beat(draft.id)] == [JobKind.UPLOAD]


def test_beat_status_enum_has_no_rendering(client: TestClient) -> None:
    assert "rendering" not in {s.value for s in BeatStatus}
    schema = client.get("/openapi.json").json()["components"]["schemas"]["BeatStatus"]
    assert "rendering" not in schema["enum"]


def test_patch_is_rejected_from_uploading_on(
    client: TestClient, repo: BeatRepo, draft: Beat
) -> None:
    """Metadata is editable while Draft or Queued and locks when the Upload starts."""
    for status in (BeatStatus.DRAFT, BeatStatus.QUEUED):
        draft.status = status
        repo.save(draft)
        assert client.patch(f"/api/beats/{draft.id}", json={"title": "Edited"}).status_code == 200

    for status in (
        BeatStatus.UPLOADING,
        BeatStatus.UPLOADED,
        BeatStatus.SCHEDULED,
        BeatStatus.PUBLISHED,
    ):
        draft.status = status
        repo.save(draft)
        response = client.patch(f"/api/beats/{draft.id}", json={"title": "Too late"})
        assert response.status_code == 409, status
        assert "before upload" in response.json()["detail"]


async def test_delete_draft_cancels_its_pending_render(
    app: FastAPI, client: TestClient, session: Session, draft: Beat
) -> None:
    job = app.state.queue.enqueue(JobKind.RENDER, draft.id)
    assert client.delete(f"/api/beats/{draft.id}").status_code == 204

    cancelled = reload_job(session, job)
    assert cancelled.status == JobStatus.FAILED and cancelled.error == CANCELLED_ERROR
    assert JobRepo(session).next_queued() is None
    await make_worker(app).run_one(job)  # the worker skips it, nothing blows up
    assert reload_job(session, job).status == JobStatus.FAILED


async def test_render_of_a_deleted_draft_fails_cleanly(
    app: FastAPI, session: Session, workspace: Workspace, repo: BeatRepo, draft: Beat
) -> None:
    """A Render already running cannot be cancelled; it finds the beat gone and fails itself."""
    job = app.state.queue.enqueue(JobKind.RENDER, draft.id)
    delete_draft(workspace, repo, draft)

    await make_worker(app).run_one(job)
    done = reload_job(session, job)
    assert done.status == JobStatus.FAILED and "does not exist" in (done.error or "")
