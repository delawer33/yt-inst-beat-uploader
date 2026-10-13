"""The Reel: its Job, the Instagram panel's state and "Show in folder".

``render_reel`` is faked (no ffmpeg) and so is the file-manager opener (no D-Bus).
"""

from io import BytesIO
from pathlib import Path

import pytest
from fastapi import FastAPI, UploadFile
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from beat_server.db.engine import make_engine
from beat_server.db.migrate import upgrade_to_head
from beat_server.db.models import Beat, BeatStatus, Job, JobKind, JobStatus
from beat_server.db.repo import BeatRepo, JobRepo
from beat_server.jobs.handlers import HANDLERS
from beat_server.jobs.worker import Worker
from beat_server.services import pipeline
from beat_server.services.beats import create_draft
from beat_upload.cover_style import CoverStyle
from beat_upload.errors import VideoError
from beat_upload.workspace import Workspace

MP3 = b"ID3" + b"\x00" * 32
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


@pytest.fixture
def draft(workspace: Workspace, session: Session) -> Beat:
    return create_draft(
        workspace,
        BeatRepo(session),
        UploadFile(BytesIO(MP3), filename="Dark Night.mp3"),
        UploadFile(BytesIO(PNG), filename="c.png"),
        {"title_template": "{name}"},
    )


@pytest.fixture
def opened(app: FastAPI) -> list[Path]:
    seen: list[Path] = []
    app.state.opener = seen.append
    return seen


def worker(app: FastAPI) -> Worker:
    return Worker(
        app.state.queue, HANDLERS, app.state.session_factory, app.state.workspace, app.state.bus
    )


def reload(session: Session, beat: Beat) -> Beat:
    session.expire_all()
    return BeatRepo(session).get(beat.id)  # type: ignore[return-value]


def recording_reel(styles: list[CoverStyle]):  # noqa: ANN201
    def fake_reel(audio: Path, image: Path, output: Path, on_progress, style=None) -> Path:  # noqa: ANN001
        styles.append(style)
        on_progress(0.5)
        output.write_bytes(f"reel {style}".encode())
        return output

    return fake_reel


def jobs_of(session: Session, beat: Beat, kind: JobKind) -> list[Job]:
    session.expire_all()
    return [j for j in JobRepo(session).for_beat(beat.id) if j.kind == kind]


# --- the Reel Job --------------------------------------------------------------------------


def test_a_new_draft_queues_a_render_and_a_reel(client: TestClient, session: Session) -> None:
    body = client.post(
        "/api/beats", files={"audio": ("My Beat.mp3", MP3), "image": ("cover.png", PNG)}
    ).json()
    kinds = sorted(j.kind for j in JobRepo(session).for_beat(body["id"]))
    assert kinds == [JobKind.REEL, JobKind.RENDER]
    assert body["active_job"]["kind"] == "render"  # the Reel is never what the beat is "doing"


def test_a_style_change_queues_one_reel_however_often_it_is_made(
    client: TestClient, session: Session, draft: Beat
) -> None:
    client.patch(f"/api/beats/{draft.id}", json={"cover_style": "stone_ocean"})
    client.patch(f"/api/beats/{draft.id}", json={"cover_style": "dio_green"})
    assert len(jobs_of(session, draft, JobKind.REEL)) == 1


async def test_the_reel_job_writes_reel_mp4_and_touches_nothing_else(
    app: FastAPI, session: Session, workspace: Workspace, draft: Beat, monkeypatch
) -> None:
    styles: list[CoverStyle] = []
    monkeypatch.setattr(pipeline, "render_reel", recording_reel(styles))
    job = app.state.queue.enqueue(JobKind.REEL, draft.id)
    await worker(app).run_one(job)

    session.expire_all()
    assert JobRepo(session).get(job.id).status == JobStatus.DONE
    beat = reload(session, draft)
    beat_dir = workspace.beat_dir(draft.id)
    assert (beat.reel_path, beat.reel_style) == ("reel.mp4", draft.cover_style)
    assert beat.reel_is_current and (beat_dir / "reel.mp4").read_bytes().startswith(b"reel")
    assert not (beat_dir / "reel.part.mp4").exists()
    assert (beat.status, beat.video_path) == (BeatStatus.DRAFT, None)
    assert JobRepo(session).next_queued() is None  # no UPLOAD, no RENDER behind it


async def test_the_reel_job_runs_for_a_published_beat(
    app: FastAPI, session: Session, draft: Beat, monkeypatch
) -> None:
    monkeypatch.setattr(pipeline, "render_reel", recording_reel([]))
    draft.status, draft.youtube_id = BeatStatus.PUBLISHED, "abc123"
    BeatRepo(session).save(draft)
    await worker(app).run_one(app.state.queue.enqueue(JobKind.REEL, draft.id))
    beat = reload(session, draft)
    assert beat.reel_is_current and beat.status == BeatStatus.PUBLISHED


async def test_a_reel_that_finishes_in_an_old_style_is_dropped_and_rendered_again(
    app: FastAPI, session: Session, workspace: Workspace, draft: Beat, monkeypatch
) -> None:
    def reel_then_owner_changes_style(audio, image, output, on_progress, style=None):  # noqa: ANN001, ANN202
        output.write_bytes(b"reel old")
        with app.state.session_factory() as other:
            beat = BeatRepo(other).get(draft.id)
            assert beat is not None
            beat.cover_style = CoverStyle.STONE_OCEAN
            BeatRepo(other).save(beat)
        return output

    monkeypatch.setattr(pipeline, "render_reel", reel_then_owner_changes_style)
    await worker(app).run_one(app.state.queue.enqueue(JobKind.REEL, draft.id))

    beat = reload(session, draft)
    beat_dir = workspace.beat_dir(draft.id)
    assert beat.reel_path is None and not beat.reel_is_current
    assert not (beat_dir / "reel.mp4").exists() and not (beat_dir / "reel.part.mp4").exists()
    follow_up = JobRepo(session).next_queued()
    assert follow_up is not None and follow_up.kind == JobKind.REEL


async def test_a_reel_in_the_current_style_is_not_rendered_again(
    app: FastAPI, session: Session, workspace: Workspace, draft: Beat, monkeypatch
) -> None:
    styles: list[CoverStyle] = []
    monkeypatch.setattr(pipeline, "render_reel", recording_reel(styles))
    (workspace.beat_dir(draft.id) / "reel.mp4").write_bytes(b"reel")
    draft.reel_path, draft.reel_style = "reel.mp4", draft.cover_style
    BeatRepo(session).save(draft)
    await worker(app).run_one(app.state.queue.enqueue(JobKind.REEL, draft.id))
    assert styles == []


async def test_a_failed_reel_leaves_the_beat_alone(
    app: FastAPI, session: Session, workspace: Workspace, draft: Beat, monkeypatch
) -> None:
    def broken(audio, image, output, on_progress, style=None):  # noqa: ANN001, ANN202
        output.write_bytes(b"half")
        raise VideoError("ffmpeg failed")

    monkeypatch.setattr(pipeline, "render_reel", broken)
    job = app.state.queue.enqueue(JobKind.REEL, draft.id)
    await worker(app).run_one(job)
    session.expire_all()
    assert JobRepo(session).get(job.id).status == JobStatus.FAILED
    assert reload(session, draft).reel_path is None
    assert not list(workspace.beat_dir(draft.id).glob("reel*"))


def test_the_upload_never_waits_for_the_reel(app: FastAPI, session: Session, draft: Beat) -> None:
    """One worker, oldest first: a Reel queued earlier must still run after an Upload."""
    app.state.queue.enqueue(JobKind.REEL, draft.id)
    upload = app.state.queue.enqueue(JobKind.UPLOAD, draft.id)
    assert JobRepo(session).next_queued().id == upload.id  # type: ignore[union-attr]


# --- the panel -----------------------------------------------------------------------------


def test_opening_the_panel_queues_the_reel_job_once(
    client: TestClient, session: Session, draft: Beat
) -> None:
    first = client.get(f"/api/beats/{draft.id}/instagram").json()
    second = client.get(f"/api/beats/{draft.id}/instagram").json()
    assert first["reel"]["state"] == second["reel"]["state"] == "rendering"
    assert first["reel"]["progress"] == 0.0
    assert len(jobs_of(session, draft, JobKind.REEL)) == 1


def test_the_panel_of_a_beat_with_a_current_reel_is_ready_and_queues_nothing(
    client: TestClient, session: Session, workspace: Workspace, draft: Beat
) -> None:
    (workspace.beat_dir(draft.id) / "reel.mp4").write_bytes(b"reel")
    draft.reel_path, draft.reel_style = "reel.mp4", draft.cover_style
    BeatRepo(session).save(draft)
    body = client.get(f"/api/beats/{draft.id}/instagram").json()
    assert body["reel"] == {"state": "ready", "progress": None, "message": None, "error": None}
    assert jobs_of(session, draft, JobKind.REEL) == []


def test_a_reel_in_an_old_style_is_rendered_again_when_the_panel_opens(
    client: TestClient, session: Session, workspace: Workspace, draft: Beat
) -> None:
    (workspace.beat_dir(draft.id) / "reel.mp4").write_bytes(b"reel")
    draft.reel_path, draft.reel_style = "reel.mp4", CoverStyle.STONE_OCEAN
    draft.cover_style = CoverStyle.DIO_GREEN
    BeatRepo(session).save(draft)
    assert client.get(f"/api/beats/{draft.id}/instagram").json()["reel"]["state"] == "rendering"
    assert len(jobs_of(session, draft, JobKind.REEL)) == 1


def test_a_beat_without_audio_and_cover_has_no_reel_and_no_job(
    client: TestClient, session: Session, draft: Beat
) -> None:
    draft.audio_path = draft.image_path = None
    BeatRepo(session).save(draft)
    body = client.get(f"/api/beats/{draft.id}/instagram").json()
    assert body["reel"]["state"] == "unavailable"
    assert jobs_of(session, draft, JobKind.REEL) == []


def test_a_failed_reel_is_reported_and_not_queued_again_by_looking(
    client: TestClient, session: Session, draft: Beat
) -> None:
    job = JobRepo(session).add(
        Job(kind=JobKind.REEL, beat_id=draft.id, status=JobStatus.FAILED, error="ffmpeg failed")
    )
    body = client.get(f"/api/beats/{draft.id}/instagram").json()
    assert body["reel"]["state"] == "failed" and body["reel"]["error"] == "ffmpeg failed"
    assert [j.id for j in jobs_of(session, draft, JobKind.REEL)] == [job.id]


def test_a_running_reel_shows_its_progress(
    client: TestClient, session: Session, draft: Beat
) -> None:
    JobRepo(session).add(
        Job(
            kind=JobKind.REEL,
            beat_id=draft.id,
            status=JobStatus.RUNNING,
            progress=0.4,
            message="Rendering the Reel",
        )
    )
    reel = client.get(f"/api/beats/{draft.id}/instagram").json()["reel"]
    assert (reel["state"], reel["progress"], reel["message"]) == (
        "rendering",
        0.4,
        "Rendering the Reel",
    )


def test_the_panel_of_an_unknown_beat_is_404(client: TestClient) -> None:
    assert client.get("/api/beats/nope/instagram").status_code == 404


# --- Show in folder ------------------------------------------------------------------------


def test_show_opens_the_reel_in_the_file_manager(
    client: TestClient,
    session: Session,
    workspace: Workspace,
    draft: Beat,
    opened: list[Path],
) -> None:
    reel = workspace.beat_dir(draft.id) / "reel.mp4"
    reel.write_bytes(b"reel")
    draft.reel_path, draft.reel_style = "reel.mp4", draft.cover_style
    BeatRepo(session).save(draft)
    assert client.post(f"/api/beats/{draft.id}/reel/show").status_code == 204
    assert opened == [reel]


def test_show_without_a_reel_on_disk_is_409_and_opens_nothing(
    client: TestClient, draft: Beat, opened: list[Path]
) -> None:
    response = client.post(f"/api/beats/{draft.id}/reel/show")
    assert response.status_code == 409 and "no Reel" in response.json()["detail"]
    assert opened == []


def test_show_in_folder_selects_the_file_over_dbus_and_falls_back_to_the_folder(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import subprocess

    from beat_server.services import reel

    reel_file = tmp_path / "reel.mp4"
    reel_file.write_bytes(b"x")
    calls: list[list[str]] = []
    exit_codes = iter([1, 0])  # gdbus fails, xdg-open works

    def fake_run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[bytes]:
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, next(exit_codes), b"", b"")

    monkeypatch.setattr(subprocess, "run", fake_run)
    reel.show_in_folder(reel_file)
    assert calls[0][0] == "gdbus"
    assert "org.freedesktop.FileManager1.ShowItems" in calls[0]
    assert f"['{reel_file.resolve().as_uri()}']" in calls[0]
    assert calls[1] == ["xdg-open", str(tmp_path)]


# --- schema --------------------------------------------------------------------------------


def test_the_migration_adds_the_reel_columns(tmp_path: Path) -> None:
    db = tmp_path / "beat.sqlite3"
    upgrade_to_head(db)
    columns = {c["name"] for c in inspect(make_engine(db)).get_columns("beats")}
    assert {"reel_path", "reel_style"} <= columns
