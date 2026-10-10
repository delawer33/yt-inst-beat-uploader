"""Send puts a Bounce Folder beat on BeatStars first, then on YouTube with the link.

Studio and ffmpeg are faked at the two seams of ``services/beatstars.py`` (``prepare`` and
``drive_studio``) and of ``services/pipeline.py`` (``render_video``, ``upload_video``).
"""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from beat_server.db.models import Beat, BeatStatus, JobKind, JobStatus
from beat_server.db.repo import BeatRepo, JobRepo
from beat_server.jobs.handlers import HANDLERS
from beat_server.jobs.worker import JobContext, Worker
from beat_server.services import beatstars, pipeline
from beat_server.services.beats import with_beatstars_link
from beat_upload.errors import BeatStarsError
from beat_upload.workspace import Workspace

TITLE = '[FREE] Yeat x Playboi Carti Type Beat 2026 - "Naughty" | Hard Trap'
MARKER = "{beatstars|DM @delawer33 on Instagram}"
URL = "https://www.beatstars.com/beat/naughty-26393000"


class Fakes:
    """What the fake Studio and YouTube were asked, and how Studio should behave."""

    def __init__(self) -> None:
        self.studio_calls: list[dict[str, Any]] = []
        self.prepared: list[tuple[Path, str]] = []
        self.uploaded: list[Any] = []
        self.fail_after_create: str | None = None  # a track id: Studio makes it, then fails


@pytest.fixture
def fakes(monkeypatch: pytest.MonkeyPatch) -> Fakes:
    fakes = Fakes()

    def fake_prepare(bounce: Path, track: Any, name: str, out_dir: Path) -> Any:
        fakes.prepared.append((bounce, name))
        return track

    def fake_studio(profile, package, draft, release, on_created, on_status):  # noqa: ANN001, ANN202
        fakes.studio_calls.append({"track": package, "draft": draft, "release": release})
        track_id = draft or "TK1"
        on_created(track_id)
        if fakes.fail_after_create:
            raise BeatStarsError(f"{track_id}: the form refused it")
        return track_id, URL

    def fake_render(audio: Path, image: Path, output: Path, on_progress, style=None) -> Path:  # noqa: ANN001
        output.write_bytes(b"mp4")
        return output

    def fake_upload(video: Path, metadata: Any, creds: Any, on_progress: Any) -> str:
        fakes.uploaded.append(metadata)
        return "yt1"

    monkeypatch.setattr(beatstars, "prepare", fake_prepare)
    monkeypatch.setattr(beatstars, "drive_studio", fake_studio)
    monkeypatch.setattr(pipeline, "render_video", fake_render)
    monkeypatch.setattr(pipeline, "upload_video", fake_upload)
    monkeypatch.setattr(JobContext, "credentials", lambda self: "creds")
    return fakes


@pytest.fixture
def bounce(tmp_path: Path) -> Path:
    folder = tmp_path / "Jungle_104bpm_Amin_calm_guitar-808"
    folder.mkdir()
    for name in ("master.wav", "tagged.mp3", "cover.png"):
        (folder / name).write_bytes(b"x")
    return folder


def make_beat(client: TestClient, bounce: Path, **patch: Any) -> str:
    beat_id = client.post("/api/beats/from-folder", json={"path": str(bounce)}).json()["id"]
    body = {"title": TITLE, "description": f"Free beat.\n{MARKER}", "privacy": "public", **patch}
    assert client.patch(f"/api/beats/{beat_id}", json=body).status_code == 200
    return beat_id


async def run_next(app: FastAPI, session: Session, kind: JobKind) -> None:
    """Run the oldest queued job, which must be of ``kind``."""
    session.expire_all()
    job = JobRepo(session).next_queued()
    assert job is not None and job.kind == kind, job and job.kind
    worker = Worker(
        app.state.queue, HANDLERS, app.state.session_factory, app.state.workspace, app.state.bus
    )
    await worker.run_one(job)


def kinds_waiting(session: Session) -> list[JobKind]:
    session.expire_all()
    return [j.kind for j in JobRepo(session).with_status(JobStatus.QUEUED)]


def beat_of(session: Session, beat_id: str) -> Beat:
    session.expire_all()
    beat = BeatRepo(session).get(beat_id)
    assert beat is not None
    return beat


def test_marker_becomes_the_link_or_its_fallback() -> None:
    assert with_beatstars_link(f"a\n{MARKER}\nb", URL) == f"a\n{URL}\nb"
    assert with_beatstars_link(f"a\n{MARKER}", None) == "a\nDM @delawer33 on Instagram"
    assert with_beatstars_link("a {beatstars} b", None) == "a  b"
    assert with_beatstars_link("no marker", URL) == "no marker"


async def test_public_send_queues_render_and_beatstars_then_upload_with_the_link(
    app: FastAPI, client: TestClient, session: Session, bounce: Path, fakes: Fakes
) -> None:
    beat_id = make_beat(client, bounce)
    assert client.post(f"/api/beats/{beat_id}/upload").status_code == 200
    # the Render queued when the Draft was made, the BeatStars Job by the send
    assert sorted(kinds_waiting(session)) == [JobKind.BEATSTARS, JobKind.RENDER]

    await run_next(app, session, JobKind.RENDER)
    assert kinds_waiting(session) == [JobKind.BEATSTARS]  # Render done: no Upload yet
    await run_next(app, session, JobKind.BEATSTARS)
    assert kinds_waiting(session) == [JobKind.UPLOAD]  # last one done queues it
    await run_next(app, session, JobKind.UPLOAD)

    beat = beat_of(session, beat_id)
    assert (beat.beatstars_id, beat.beatstars_url) == ("TK1", URL)
    assert beat.description == f"Free beat.\n{MARKER}"  # the Beat keeps the marker
    assert fakes.uploaded[0].description == f"Free beat.\n{URL}"
    assert beat.status == BeatStatus.PUBLISHED
    assert fakes.prepared == [(bounce, "Naughty")]
    track = fakes.studio_calls[0]["track"]
    assert track.title == "Naughty | Yeat x Playboi Carti Type Beat"
    assert (track.bpm, track.key) == (104, "Amin")


async def test_beatstars_finishing_first_leaves_the_upload_to_the_render(
    app: FastAPI, client: TestClient, session: Session, bounce: Path, fakes: Fakes
) -> None:
    """The BEATSTARS job ran while the Render was still waiting: the Render queues the Upload."""
    beat_id = make_beat(client, bounce)
    client.post(f"/api/beats/{beat_id}/upload")
    session.expire_all()
    render = next(j for j in JobRepo(session).for_beat(beat_id) if j.kind == JobKind.RENDER)
    bs = next(j for j in JobRepo(session).for_beat(beat_id) if j.kind == JobKind.BEATSTARS)
    worker = Worker(
        app.state.queue, HANDLERS, app.state.session_factory, app.state.workspace, app.state.bus
    )
    await worker.run_one(bs)
    assert kinds_waiting(session) == [JobKind.RENDER]  # no video yet: no Upload
    await worker.run_one(render)
    assert kinds_waiting(session) == [JobKind.UPLOAD]


async def test_render_finishing_while_beatstars_is_pending_queues_no_upload(
    app: FastAPI, client: TestClient, session: Session, bounce: Path, fakes: Fakes
) -> None:
    beat_id = make_beat(client, bounce)
    client.post(f"/api/beats/{beat_id}/upload")
    await run_next(app, session, JobKind.RENDER)
    assert JobKind.UPLOAD not in kinds_waiting(session)
    assert beat_of(session, beat_id).status == BeatStatus.QUEUED


async def test_send_of_a_rendered_beat_queues_only_beatstars(
    app: FastAPI, client: TestClient, session: Session, bounce: Path, fakes: Fakes
) -> None:
    beat_id = make_beat(client, bounce)
    await run_next(app, session, JobKind.RENDER)  # the Render started with the Draft
    client.post(f"/api/beats/{beat_id}/upload")
    assert kinds_waiting(session) == [JobKind.BEATSTARS]
    await run_next(app, session, JobKind.BEATSTARS)
    assert kinds_waiting(session) == [JobKind.UPLOAD]


async def test_private_send_skips_beatstars_and_uses_the_fallback(
    app: FastAPI, client: TestClient, session: Session, bounce: Path, fakes: Fakes
) -> None:
    beat_id = make_beat(client, bounce, privacy="private")
    client.post(f"/api/beats/{beat_id}/upload")
    assert kinds_waiting(session) == [JobKind.RENDER]
    await run_next(app, session, JobKind.RENDER)
    assert kinds_waiting(session) == [JobKind.UPLOAD]
    await run_next(app, session, JobKind.UPLOAD)
    assert fakes.studio_calls == []
    assert fakes.uploaded[0].description == "Free beat.\nDM @delawer33 on Instagram"


async def test_scheduled_send_gives_studio_the_publish_time(
    app: FastAPI, client: TestClient, session: Session, bounce: Path, fakes: Fakes
) -> None:
    when = (datetime.now(UTC) + timedelta(days=1)).replace(microsecond=0)
    beat_id = make_beat(client, bounce, privacy="private", publish_at=when.isoformat())
    client.post(f"/api/beats/{beat_id}/upload")
    await run_next(app, session, JobKind.RENDER)
    await run_next(app, session, JobKind.BEATSTARS)
    assert fakes.studio_calls[0]["release"] == when


async def test_studio_failing_keeps_the_track_id_and_the_beat_queued_and_retry_resumes(
    app: FastAPI, client: TestClient, session: Session, bounce: Path, fakes: Fakes
) -> None:
    beat_id = make_beat(client, bounce)
    client.post(f"/api/beats/{beat_id}/upload")
    await run_next(app, session, JobKind.RENDER)
    fakes.fail_after_create = "TK1"
    await run_next(app, session, JobKind.BEATSTARS)

    session.expire_all()
    failed = next(j for j in JobRepo(session).for_beat(beat_id) if j.kind == JobKind.BEATSTARS)
    assert failed.status == JobStatus.FAILED and "TK1" in (failed.error or "")
    beat = beat_of(session, beat_id)
    assert (beat.status, beat.beatstars_id, beat.beatstars_url) == (BeatStatus.QUEUED, "TK1", None)
    assert kinds_waiting(session) == []  # no Upload behind a failed BeatStars job

    fakes.fail_after_create = None
    assert client.post(f"/api/jobs/{failed.id}/retry").status_code == 200
    await run_next(app, session, JobKind.BEATSTARS)
    assert fakes.studio_calls[-1]["draft"] == "TK1"
    assert kinds_waiting(session) == [JobKind.UPLOAD]
    assert beat_of(session, beat_id).beatstars_url == URL


def test_a_title_beatstars_cannot_read_is_refused_at_send(
    client: TestClient, session: Session, bounce: Path, fakes: Fakes
) -> None:
    beat_id = make_beat(client, bounce, title="Untitled")
    response = client.post(f"/api/beats/{beat_id}/upload")
    assert response.status_code == 400 and "Type Beat" in response.json()["detail"]
    assert beat_of(session, beat_id).status == BeatStatus.DRAFT
    # a private send never reaches BeatStars, so the same title goes through
    client.patch(f"/api/beats/{beat_id}", json={"privacy": "private"})
    assert client.post(f"/api/beats/{beat_id}/upload").status_code == 200


def test_track_of_uses_exact_name_matches_plus_genre_moods_when_fill_never_ran(
    client: TestClient, session: Session, bounce: Path, workspace: Workspace
) -> None:
    beat = beat_of(session, make_beat(client, bounce))
    track = beatstars.track_of(beat)
    # name moods ["calm"] -> "Calm" is on Studio's list; "Hard Trap" adds its own moods
    assert track.moods == ["Calm", "Energetic", "Intense", "Angry"]
    assert track.instruments == ["Guitar"]  # "808" is not on the list
    beat.beatstars_moods = ["Dark"]
    beat.beatstars_instruments = ["Bass"]
    track = beatstars.track_of(beat)
    assert (track.moods, track.instruments) == (["Dark"], ["Bass"])


async def test_skip_after_a_failed_beatstars_job_queues_the_upload_with_the_fallback(
    app: FastAPI, client: TestClient, session: Session, bounce: Path, fakes: Fakes
) -> None:
    beat_id = make_beat(client, bounce)
    client.post(f"/api/beats/{beat_id}/upload")
    await run_next(app, session, JobKind.RENDER)
    fakes.fail_after_create = "TK1"
    await run_next(app, session, JobKind.BEATSTARS)

    response = client.post(f"/api/beats/{beat_id}/skip-beatstars")
    assert response.status_code == 200
    assert response.json()["beatstars"]["release"] == "skipped_by_owner"
    assert kinds_waiting(session) == [JobKind.UPLOAD]
    await run_next(app, session, JobKind.UPLOAD)
    assert fakes.uploaded[0].description == "Free beat.\nDM @delawer33 on Instagram"
    assert beat_of(session, beat_id).beatstars_url is None


async def test_skip_waits_for_the_render_when_the_video_is_not_there_yet(
    app: FastAPI, client: TestClient, session: Session, bounce: Path, fakes: Fakes
) -> None:
    beat_id = make_beat(client, bounce)
    client.post(f"/api/beats/{beat_id}/upload")
    fakes.fail_after_create = "TK1"
    await run_next(app, session, JobKind.RENDER)
    await run_next(app, session, JobKind.BEATSTARS)
    beat = beat_of(session, beat_id)
    beat.video_path = None  # the video went away: the Render has to run again
    BeatRepo(session).save(beat)

    assert client.post(f"/api/beats/{beat_id}/skip-beatstars").status_code == 200
    assert kinds_waiting(session) == [JobKind.RENDER]


def test_skip_is_refused_unless_a_beatstars_job_failed_on_a_queued_beat(
    client: TestClient, session: Session, bounce: Path, fakes: Fakes
) -> None:
    beat_id = make_beat(client, bounce)
    draft = client.post(f"/api/beats/{beat_id}/skip-beatstars")
    assert draft.status_code == 409 and "Queued" in draft.json()["detail"]

    client.post(f"/api/beats/{beat_id}/upload")  # Queued, BEATSTARS job still waiting
    waiting = client.post(f"/api/beats/{beat_id}/skip-beatstars")
    assert waiting.status_code == 409 and "failed" in waiting.json()["detail"]
    assert not beat_of(session, beat_id).beatstars_skipped
    assert client.post("/api/beats/nope/skip-beatstars").status_code == 404
