"""The Effect of a Beat: the list, the pick, and the Reel that follows (ADR 0012: the
Effect moves the Reel alone; the YouTube video is always Still).

Mirrors the Cover Style tests in ``test_pipeline.py``: ``render_effect`` is replaced by a fake
that records the plan; the Still paths stay on ``render_video`` / ``render_reel``.
"""

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from beat_server.db.models import Beat, BeatStatus, JobKind, JobStatus
from beat_server.db.repo import BeatRepo, JobRepo
from beat_server.services import beats as beats_service
from beat_server.services import pipeline
from beat_server.services.effects import effect_meta_of
from beat_upload.cover_style import CoverStyle
from beat_upload.visual.render import RenderPlan
from beat_upload.workspace import Workspace
from tests.server.test_beats_bounce import bounce
from tests.server.test_pipeline import make_worker, reload_beat, reload_job


def recording_effect_render(plans: list[RenderPlan], clips: list[Path | None] | None = None):  # noqa: ANN201, E501
    def fake(
        audio: Path,
        image: Path,
        output: Path,
        plan: RenderPlan,
        on_progress=None,  # noqa: ANN001
        on_status=None,  # noqa: ANN001
        clip: Path | None = None,
    ) -> Path:
        plans.append(plan)
        if clips is not None:
            clips.append(clip)
        if on_status:
            on_status("Listening to the beat")
        if on_progress:
            on_progress(0.5)
        output.write_bytes(f"mp4 {plan.effect} {plan.format}".encode())
        return output

    return fake


def test_effects_are_listed_with_the_lab_files(client: TestClient) -> None:
    body = client.get("/api/effects").json()
    ids = [e["id"] for e in body["effects"]]
    assert ids[:8] == ["still", "burst", "chain", "crown", "dagger", "doubloon", "flow", "gem"]
    assert ids[8:10] == ["vj_rapid", "vjcut"]
    assert body["effects"][3]["name"] == "Crown"
    assert "crown.js" in body["files"] and "vjcut.js" in body["files"]


def test_the_visual_lab_is_served(client: TestClient) -> None:
    assert client.get("/visual/lab.html").status_code == 200
    assert client.get("/visual/engine.js").status_code == 200
    assert client.get("/visual/effects/vjcut.js").status_code == 200
    assert client.get("/fonts/LeagueGothic-Regular.ttf").status_code == 200


def test_new_draft_is_still(client: TestClient, draft: Beat) -> None:
    body = client.get(f"/api/beats/{draft.id}").json()
    assert body["effect"] == "still"
    assert "video_effect" not in body and "render_ready" not in body


async def test_picking_an_effect_renders_the_reel_with_it_and_the_video_stays_still(
    app: FastAPI,
    client: TestClient,
    session: Session,
    workspace: Workspace,
    draft: Beat,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plans: list[RenderPlan] = []
    monkeypatch.setattr(pipeline, "render_effect", recording_effect_render(plans))
    monkeypatch.setattr(pipeline, "render_video", lambda *a, **k: pytest.fail("video rendered"))
    monkeypatch.setattr(pipeline, "render_reel", lambda *a, **k: pytest.fail("Still Reel"))
    app.state.queue.cancel_for_beat(draft.id)  # the Render and the Reel queued by the drop

    body = client.patch(f"/api/beats/{draft.id}", json={"effect": "vjcut"}).json()
    assert body["effect"] == "vjcut" and body["rendered"] is False
    assert body["active_job"] is None  # a REEL is never the active job (ADR 0009)

    jobs = JobRepo(session)
    assert not jobs.has_waiting(JobKind.RENDER, draft.id)  # the video is Still: untouched
    reel = jobs.next_queued()
    assert reel is not None and reel.kind == JobKind.REEL
    await make_worker(app).run_one(reel)

    assert [(p.effect, p.format, p.style) for p in plans] == [
        ("vjcut", "reel", CoverStyle.FILM_GRAIN)
    ]
    assert plans[0].seed != 0
    beat = reload_beat(session, draft)
    assert beat.reel_effect == "vjcut" and beat.reel_meta == beat.header
    assert beat.header["title"] == draft.title  # no year in the template: the whole title
    assert beat.reel_is_current and beat.video_path is None
    beat_dir = workspace.beat_dir(draft.id)
    assert (beat_dir / "reel.mp4").read_bytes() == b"mp4 vjcut reel"
    assert not (beat_dir / "video.mp4").exists()
    assert reload_job(session, reel).status == JobStatus.DONE


def test_a_still_video_stays_current_when_an_effect_is_picked_and_only_the_reel_is_queued(
    app: FastAPI,
    client: TestClient,
    session: Session,
    workspace: Workspace,
    repo: BeatRepo,
    draft: Beat,
) -> None:
    (workspace.beat_dir(draft.id) / "video.mp4").write_bytes(b"mp4")
    draft.video_path, draft.video_style = "video.mp4", draft.cover_style
    repo.save(draft)
    app.state.queue.cancel_for_beat(draft.id)  # the Render and the Reel queued by the drop
    jobs = JobRepo(session)
    assert client.get(f"/api/beats/{draft.id}").json()["rendered"] is True
    body = client.patch(f"/api/beats/{draft.id}", json={"effect": "vjcut"}).json()
    assert body["rendered"] is True and body["active_job"] is None
    assert jobs.has_waiting(JobKind.REEL, draft.id)
    assert not jobs.has_waiting(JobKind.RENDER, draft.id)


def test_effect_must_be_known_and_may_change_on_a_queued_beat(
    client: TestClient, repo: BeatRepo, draft: Beat
) -> None:
    assert client.patch(f"/api/beats/{draft.id}", json={"effect": "wipe"}).status_code == 422
    draft.status = BeatStatus.QUEUED  # on its way to YouTube; the Reel is Instagram's
    repo.save(draft)
    response = client.patch(f"/api/beats/{draft.id}", json={"effect": "vjcut"})
    assert response.status_code == 200 and response.json()["effect"] == "vjcut"


async def test_an_effect_changed_during_the_reel_drops_the_file(
    app: FastAPI,
    session: Session,
    workspace: Workspace,
    repo: BeatRepo,
    draft: Beat,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    draft.effect = "vjcut"
    repo.save(draft)

    def switch_back(
        audio: Path, image: Path, output: Path, plan: RenderPlan, *args, **kwargs
    ) -> Path:  # noqa: ANN002, ANN003
        with app.state.session_factory() as other:
            beat = BeatRepo(other).get(draft.id)
            assert beat is not None
            beat.effect = "still"
            BeatRepo(other).save(beat)
        output.write_bytes(b"mp4 vjcut")
        return output

    monkeypatch.setattr(pipeline, "render_effect", switch_back)
    monkeypatch.setattr(pipeline, "render_reel", lambda *a, **k: pytest.fail("not now"))
    job = app.state.queue.enqueue(JobKind.REEL, draft.id)
    await make_worker(app).run_one(job)
    beat = reload_beat(session, draft)
    assert beat.reel_path is None and not (workspace.beat_dir(draft.id) / "reel.mp4").exists()
    assert JobRepo(session).has_waiting(JobKind.REEL, draft.id)  # rendered again, as Still


def test_effect_meta_comes_from_the_youtube_title(draft: Beat) -> None:
    draft.title = '[FREE] Juice WRLD x Lil Peep Type Beat 2026 - "Night Drive" | Emo Rap'
    draft.bpm, draft.music_key = 140, "Fmin"
    meta = effect_meta_of(draft)
    assert (meta.title, meta.artists, meta.bpm, meta.key) == (
        "Night Drive",
        "Juice WRLD x Lil Peep",
        140,
        "Fmin",
    )  # noqa: E501
    draft.title = "Dark Night"
    draft.bpm = draft.music_key = None
    meta = effect_meta_of(draft)
    assert (meta.title, meta.artists, meta.bpm, meta.key) == ("Dark Night", "", None, "")


@pytest.fixture
def clip_draft(
    client: TestClient, session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Beat:
    """A Draft from a Bounce Folder whose cover is a Clip (``loop.mp4``)."""
    folder = bounce(tmp_path, png=True)
    (folder / "loop.mp4").write_bytes(b"mp4")
    monkeypatch.setattr(beats_service, "clip_frame", lambda c, o: o.write_bytes(b"jpg") and o)
    body = client.post("/api/beats/from-folder", json={"path": str(folder)}).json()
    beat = BeatRepo(session).get(body["id"])
    assert beat is not None
    beat.title = "Night Drive"  # a Bounce Folder Draft starts without one
    BeatRepo(session).save(beat)
    return beat


async def test_still_with_a_clip_loops_the_clip_for_the_video_and_the_reel(
    app: FastAPI,
    session: Session,
    workspace: Workspace,
    clip_draft: Beat,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[Path, str, CoverStyle]] = []

    def fake_clip(
        audio: Path, clip: Path, output: Path, on_progress=None, style=None, fmt="yt"
    ) -> Path:  # noqa: ANN001, E501
        calls.append((clip, fmt, style))
        output.write_bytes(f"mp4 clip {fmt}".encode())
        return output

    monkeypatch.setattr(pipeline, "render_clip", fake_clip)
    monkeypatch.setattr(pipeline, "render_video", lambda *a, **k: pytest.fail("image path used"))
    monkeypatch.setattr(pipeline, "render_reel", lambda *a, **k: pytest.fail("image path used"))
    jobs = JobRepo(session)
    for _ in range(2):  # the RENDER and the REEL the drop queued
        job = jobs.next_queued()
        assert job is not None
        await make_worker(app).run_one(job)
    clip = Path(clip_draft.clip_path or "")
    assert calls == [
        (clip, "yt", CoverStyle.FILM_GRAIN),
        (clip, "reel", CoverStyle.FILM_GRAIN),
    ]  # noqa: E501
    beat_dir = workspace.beat_dir(clip_draft.id)
    assert (beat_dir / "video.mp4").read_bytes() == b"mp4 clip yt"
    assert (beat_dir / "reel.mp4").read_bytes() == b"mp4 clip reel"


async def test_an_effect_with_a_clip_gets_the_clip(
    app: FastAPI,
    client: TestClient,
    session: Session,
    clip_draft: Beat,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plans: list[RenderPlan] = []
    clips: list[Path | None] = []
    monkeypatch.setattr(pipeline, "render_effect", recording_effect_render(plans, clips))
    app.state.queue.cancel_for_beat(clip_draft.id)
    response = client.patch(f"/api/beats/{clip_draft.id}", json={"effect": "vjcut"})
    assert response.status_code == 200, response.text
    job = JobRepo(session).next_queued()
    assert job is not None and job.kind == JobKind.REEL
    await make_worker(app).run_one(job)
    assert [(p.effect, p.format) for p in plans] == [("vjcut", "reel")]
    assert clips == [Path(clip_draft.clip_path or "")]


def test_the_header_is_kept_with_the_reel_and_a_new_title_makes_it_stale(
    app: FastAPI,
    client: TestClient,
    session: Session,
    workspace: Workspace,
    repo: BeatRepo,
    draft: Beat,
) -> None:
    draft.effect = "vjcut"
    draft.reel_path, draft.reel_style, draft.reel_effect = "reel.mp4", draft.cover_style, "vjcut"
    draft.reel_meta = draft.header
    (workspace.beat_dir(draft.id) / "reel.mp4").write_bytes(b"mp4")
    repo.save(draft)
    assert draft.reel_is_current
    app.state.queue.cancel_for_beat(draft.id)
    jobs = JobRepo(session)

    client.patch(f"/api/beats/{draft.id}", json={"title": "New Name"})
    beat = reload_beat(session, draft)
    assert not beat.reel_is_current and jobs.has_waiting(JobKind.REEL, draft.id)
    assert not jobs.has_waiting(JobKind.RENDER, draft.id)  # the video has no header in it


def test_an_effect_reel_waits_for_the_title_and_the_panel_says_so(
    app: FastAPI, client: TestClient, session: Session, repo: BeatRepo, draft: Beat
) -> None:
    app.state.queue.cancel_for_beat(draft.id)
    draft.title = '[FREE] [[Artist]] Type Beat 2026 - "" | [[Genre]]'
    repo.save(draft)
    body = client.patch(f"/api/beats/{draft.id}", json={"effect": "vjcut"}).json()
    assert body["effect"] == "vjcut"
    jobs = JobRepo(session)
    assert not jobs.has_waiting(JobKind.REEL, draft.id)
    panel = client.get(f"/api/beats/{draft.id}/instagram").json()
    assert panel["reel"]["state"] == "untitled"
    assert not jobs.has_waiting(JobKind.REEL, draft.id)  # the panel queues nothing either
    # the title arrives: now the Reel is queued
    client.patch(f"/api/beats/{draft.id}", json={"title": "Night Drive"})
    assert jobs.has_waiting(JobKind.REEL, draft.id)
    assert client.get(f"/api/beats/{draft.id}/instagram").json()["reel"]["state"] == "rendering"


async def test_run_reel_refuses_an_effect_without_a_title(
    app: FastAPI, session: Session, repo: BeatRepo, draft: Beat
) -> None:
    draft.effect = "vjcut"
    draft.title = ""
    repo.save(draft)
    job = app.state.queue.enqueue(JobKind.REEL, draft.id)
    await make_worker(app).run_one(job)
    job = reload_job(session, job)
    assert job.status == JobStatus.FAILED and "title first" in (job.error or "")
    assert not JobRepo(session).has_waiting(JobKind.REEL, draft.id)


def test_header_ready_and_the_header_words() -> None:
    beat = Beat(title='[FREE] A x B Type Beat 2026 - "Night" | Trap', bpm=140, effect="vjcut")
    assert beat.header == {"title": "Night", "artists": "A x B", "bpm": 140, "key": ""}
    assert beat.header_ready
    beat.title = "[FREE] [[A]] Type Beat"
    assert not beat.header_ready
    beat.title = "Plain Words"
    assert beat.header["title"] == "Plain Words" and beat.header_ready
    beat.effect = "still"
    beat.title = ""
    assert beat.header_ready


async def test_a_reel_of_a_baked_effect_plays_the_bake_instead_of_the_engine(
    app: FastAPI,
    session: Session,
    workspace: Workspace,
    repo: BeatRepo,
    draft: Beat,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace.bakes_dir.mkdir()
    (workspace.bakes_dir / "chain.mp4").write_bytes(b"loop")
    played: list[tuple[Path, str]] = []

    def fake_play(audio: Path, clip: Path, meta, output: Path, on_progress=None) -> Path:  # noqa: ANN001
        played.append((clip, meta.title))
        output.write_bytes(b"mp4 from bake")
        return output

    monkeypatch.setattr(pipeline, "render_from_bake", fake_play)
    monkeypatch.setattr(pipeline, "render_effect", lambda *a, **k: pytest.fail("engine used"))
    app.state.queue.cancel_for_beat(draft.id)
    draft.effect = "chain"
    repo.save(draft)
    job = app.state.queue.enqueue(JobKind.REEL, draft.id)
    await make_worker(app).run_one(job)
    assert played == [(workspace.bakes_dir / "chain.mp4", draft.header["title"])]
    beat = reload_beat(session, draft)
    assert beat.reel_effect == "chain" and beat.reel_is_current
    assert (workspace.beat_dir(draft.id) / "reel.mp4").read_bytes() == b"mp4 from bake"
    # the crown is not baked yet: the engine draws it
    plans: list[RenderPlan] = []
    monkeypatch.setattr(pipeline, "render_effect", recording_effect_render(plans))
    beat.effect = "crown"
    repo.save(beat)
    job = app.state.queue.enqueue(JobKind.REEL, draft.id)
    await make_worker(app).run_one(job)
    assert [p.effect for p in plans] == ["crown"]


def test_an_autosave_that_leaves_the_header_alone_queues_no_reel_after_a_failed_one(
    app: FastAPI, client: TestClient, session: Session, repo: BeatRepo, draft: Beat
) -> None:
    app.state.queue.cancel_for_beat(draft.id)
    draft.effect = "crown"
    repo.save(draft)
    jobs = JobRepo(session)
    failed = reload_job(session, app.state.queue.enqueue(JobKind.REEL, draft.id))
    failed.status = JobStatus.FAILED
    failed.error = "ffmpeg failed"
    jobs.save(failed)
    # the description changes every few seconds while the owner types: no REEL for that
    client.patch(f"/api/beats/{draft.id}", json={"description": "typing..."})
    assert not jobs.has_waiting(JobKind.REEL, draft.id)
    # the title changes the header: now a REEL is due
    client.patch(f"/api/beats/{draft.id}", json={"title": "Other Name"})
    assert jobs.has_waiting(JobKind.REEL, draft.id)
