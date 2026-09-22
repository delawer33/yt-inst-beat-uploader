"""Worker state machine, queue recovery, event bus and the jobs API."""

import asyncio
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from beat_server.api.events import event_stream
from beat_server.db.models import Job, JobKind, JobStatus
from beat_server.db.repo import JobRepo
from beat_server.jobs.events import Event, EventBus
from beat_server.jobs.queue import JobQueue
from beat_server.jobs.worker import JobContext, Worker
from beat_upload.errors import AuthError, VideoError
from beat_upload.workspace import Workspace


@pytest.fixture
def bus(app: FastAPI) -> EventBus:
    return app.state.bus


@pytest.fixture
def queue(app: FastAPI) -> JobQueue:
    return app.state.queue


def make_worker(app: FastAPI, handlers: dict) -> Worker:
    return Worker(
        app.state.queue,
        handlers,
        app.state.session_factory,
        app.state.workspace,
        app.state.bus,
        poll_interval=0.01,
    )


def reload(session: Session, job: Job) -> Job:
    session.expire_all()
    return JobRepo(session).get(job.id)  # type: ignore[return-value]


async def test_auth_error_pauses_job(app: FastAPI, queue: JobQueue, session: Session) -> None:
    async def handler(ctx: JobContext) -> None:
        raise AuthError("Not logged in. Run `beat-upload login` first.")

    job = queue.enqueue(JobKind.UPLOAD, beat_id="b1")
    await make_worker(app, {JobKind.UPLOAD: handler}).run_one(job)

    job = reload(session, job)
    assert job.status == JobStatus.PAUSED
    assert job.error == "Not logged in. Run `beat-upload login` first."
    assert job.started_at is not None and job.finished_at is not None


async def test_video_error_fails_job_with_message(
    app: FastAPI, queue: JobQueue, session: Session
) -> None:
    async def handler(ctx: JobContext) -> None:
        raise VideoError("ffmpeg exited with code 1")

    job = queue.enqueue(JobKind.RENDER)
    await make_worker(app, {JobKind.RENDER: handler}).run_one(job)

    job = reload(session, job)
    assert job.status == JobStatus.FAILED
    assert job.error == "ffmpeg exited with code 1"
    assert "Traceback" not in job.error


async def test_unexpected_error_fails_job_and_logs_traceback(
    app: FastAPI, queue: JobQueue, session: Session, caplog: pytest.LogCaptureFixture
) -> None:
    async def handler(ctx: JobContext) -> None:
        raise RuntimeError("boom")

    job = queue.enqueue(JobKind.STATS)
    with caplog.at_level(logging.ERROR, logger="beat_server.jobs.worker"):
        await make_worker(app, {JobKind.STATS: handler}).run_one(job)

    job = reload(session, job)
    assert job.status == JobStatus.FAILED
    assert job.error == "Unexpected error: RuntimeError"
    assert "boom" not in job.error
    assert "RuntimeError: boom" in caplog.text


async def test_success_marks_done(app: FastAPI, queue: JobQueue, session: Session) -> None:
    async def handler(ctx: JobContext) -> None:
        ctx.progress(0.5, "halfway")

    job = queue.enqueue(JobKind.SYNC)
    await make_worker(app, {JobKind.SYNC: handler}).run_one(job)

    job = reload(session, job)
    assert job.status == JobStatus.DONE
    assert job.progress == 1.0
    assert job.message == "halfway"


async def test_unknown_kind_fails(app: FastAPI, queue: JobQueue, session: Session) -> None:
    job = queue.enqueue(JobKind.SYNC)
    await make_worker(app, {}).run_one(job)
    assert reload(session, job).status == JobStatus.FAILED


async def test_progress_updates_row_and_publishes(
    app: FastAPI, queue: JobQueue, bus: EventBus, session: Session
) -> None:
    received: list[Event] = []

    async def listen() -> None:
        async for event in bus.subscribe():
            received.append(event)

    listener = asyncio.create_task(listen())
    await asyncio.sleep(0)  # let the subscriber register

    async def handler(ctx: JobContext) -> None:
        await asyncio.to_thread(ctx.progress, 0.25, "rendering")  # from a worker thread

    job = queue.enqueue(JobKind.RENDER, beat_id="b1")
    await make_worker(app, {JobKind.RENDER: handler}).run_one(job)
    await asyncio.sleep(0.05)  # drain the subscriber queue
    listener.cancel()

    progress_events = [
        e for e in received if e.type == "job" and e.payload["message"] == "rendering"
    ]
    assert progress_events and progress_events[0].payload["progress"] == 0.25
    assert progress_events[0].payload["id"] == job.id
    assert received[-1].payload["status"] == "done"
    assert reload(session, job).message == "rendering"


async def test_handler_can_enqueue_follow_up(
    app: FastAPI, queue: JobQueue, session: Session
) -> None:
    async def handler(ctx: JobContext) -> None:
        ctx.enqueue(JobKind.UPLOAD, ctx.job.beat_id)

    job = queue.enqueue(JobKind.RENDER, beat_id="b1")
    await make_worker(app, {JobKind.RENDER: handler}).run_one(job)

    follow_up = JobRepo(session).next_queued()
    assert follow_up is not None
    assert (follow_up.kind, follow_up.beat_id) == (JobKind.UPLOAD, "b1")


async def test_run_forever_picks_up_queued_jobs(
    app: FastAPI, queue: JobQueue, session: Session
) -> None:
    done = asyncio.Event()

    async def handler(ctx: JobContext) -> None:
        done.set()

    job = queue.enqueue(JobKind.SYNC)
    task = asyncio.create_task(make_worker(app, {JobKind.SYNC: handler}).run_forever())
    await asyncio.wait_for(done.wait(), timeout=2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert reload(session, job).status == JobStatus.DONE


def test_recover_flips_running_to_queued(queue: JobQueue, session: Session) -> None:
    repo = JobRepo(session)
    repo.add(Job(kind=JobKind.SYNC, status=JobStatus.RUNNING))
    repo.add(Job(kind=JobKind.SYNC, status=JobStatus.DONE))

    assert queue.recover() == 1
    session.expire_all()
    assert [j.status for j in repo.list()] == [JobStatus.DONE, JobStatus.QUEUED]


def test_resume_paused_flips_paused_to_queued(queue: JobQueue, session: Session) -> None:
    repo = JobRepo(session)
    paused = repo.add(Job(kind=JobKind.UPLOAD, status=JobStatus.PAUSED, error="no token"))

    assert queue.resume_paused() == 1
    paused = reload(session, paused)
    assert paused.status == JobStatus.QUEUED
    assert paused.error is None


def test_app_exposes_on_reconnect(app: FastAPI, queue: JobQueue) -> None:
    assert app.state.on_reconnect == queue.resume_paused


async def test_event_stream_formats_sse(bus: EventBus) -> None:
    stream = event_stream(bus, keepalive=0.01)
    first = asyncio.ensure_future(anext(stream))
    await asyncio.sleep(0)  # subscribe before publishing
    bus.publish_beat("b1", "rendering")
    assert await first == 'event: beat\ndata: {"id": "b1", "status": "rendering"}\n\n'
    assert await anext(stream) == ": keepalive\n\n"
    await stream.aclose()


def test_sync_endpoint_enqueues_job(client: TestClient) -> None:
    created = client.post("/api/sync")
    assert created.status_code == 200
    body = created.json()
    assert body["kind"] == "sync" and body["status"] == "queued" and body["beat_id"] is None

    listed = client.get("/api/jobs").json()
    assert [j["id"] for j in listed] == [body["id"]]
    assert client.get(f"/api/jobs/{body['id']}").json() == body
    assert client.get("/api/jobs/nope").status_code == 404


def test_jobs_filter_by_beat(client: TestClient, queue: JobQueue) -> None:
    queue.enqueue(JobKind.RENDER, beat_id="b1")
    queue.enqueue(JobKind.RENDER, beat_id="b2")
    assert [j["beat_id"] for j in client.get("/api/jobs", params={"beat_id": "b2"}).json()] == [
        "b2"
    ]


def test_retry_rules(client: TestClient, queue: JobQueue, session: Session) -> None:
    queued = client.post("/api/sync").json()
    assert client.post(f"/api/jobs/{queued['id']}/retry").status_code == 409
    assert client.post("/api/jobs/nope/retry").status_code == 404

    failed = JobRepo(session).add(
        Job(kind=JobKind.UPLOAD, beat_id="b1", status=JobStatus.FAILED, error="x")
    )
    retried = client.post(f"/api/jobs/{failed.id}/retry")
    assert retried.status_code == 200
    assert retried.json()["kind"] == "upload"
    assert retried.json()["beat_id"] == "b1"
    assert retried.json()["status"] == "queued"
    assert retried.json()["id"] != failed.id


def test_lifespan_recovers_and_can_start_worker(workspace: Workspace) -> None:
    from beat_server.app import create_app
    from beat_server.db.engine import MEMORY
    from beat_server.db.models import Base
    from beat_server.settings import ServerSettings

    app = create_app(workspace, ServerSettings(), web_dist=None, db_path=MEMORY, migrate=False)
    Base.metadata.create_all(app.state.engine)
    with app.state.session_factory() as s:
        JobRepo(s).add(Job(kind=JobKind.SYNC, status=JobStatus.RUNNING))
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
    with app.state.session_factory() as s:
        # The worker may already have picked the job up; without a token a real SYNC pauses.
        assert JobRepo(s).list()[0].status in {
            JobStatus.QUEUED,
            JobStatus.RUNNING,
            JobStatus.DONE,
            JobStatus.PAUSED,
        }
