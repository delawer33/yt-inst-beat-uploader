"""FastAPI application factory.

Later slices register their routers in ``_include_routers`` (all under ``/api``). The
built frontend (``web/dist``) is served at ``/`` with an SPA fallback; when it is not built,
``/`` answers with a plain "alive" page so the server is still usable for the API.
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from starlette.staticfiles import StaticFiles

from beat_server.api import auth as auth_api
from beat_server.api import events, jobs, sync
from beat_server.api import settings as settings_api
from beat_server.api.errors import register_error_handlers
from beat_server.db.engine import make_engine, make_session_factory
from beat_server.db.migrate import upgrade_to_head
from beat_server.jobs.events import EventBus
from beat_server.jobs.handlers import HANDLERS
from beat_server.jobs.queue import JobQueue
from beat_server.jobs.worker import Worker
from beat_server.settings import ServerSettings
from beat_upload.workspace import Workspace

log = logging.getLogger(__name__)

WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"

_ALIVE_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>beat-upload</title></head>
<body><p>beat-upload server is alive. The web UI is not built; run <code>npm run build</code>
in <code>web/</code>.</p></body></html>
"""

api = APIRouter(prefix="/api")


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def create_app(
    workspace: Workspace,
    settings: ServerSettings,
    *,
    web_dist: Path | None = WEB_DIST,
    db_path: Path | str | None = None,
    migrate: bool = True,
    start_worker: bool = True,
) -> FastAPI:
    """Build the app.

    ``db_path`` overrides ``workspace.db_file`` (tests pass ``":memory:"``); ``migrate=False``
    lets tests create tables themselves; ``start_worker=False`` skips the background job
    worker (tests drive ``Worker.run_one`` directly).
    """
    db_path = workspace.db_file if db_path is None else db_path

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.queue.recover()
        worker_task = None
        if start_worker:
            worker_task = asyncio.create_task(app.state.worker.run_forever())
            worker_task.add_done_callback(_log_worker_exit)
        # Scheduler starts here in a later slice.
        try:
            yield
        finally:
            if worker_task is not None:
                worker_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await worker_task

    app = FastAPI(title="beat-upload", version="0.1.0", lifespan=lifespan)
    app.state.workspace = workspace
    app.state.settings = settings

    if migrate:
        upgrade_to_head(db_path)
    engine = make_engine(db_path)
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)

    bus = EventBus()
    queue = JobQueue(app.state.session_factory, bus)
    app.state.bus = bus
    app.state.queue = queue
    app.state.worker = Worker(queue, HANDLERS, app.state.session_factory, workspace, bus)
    app.state.on_reconnect = queue.resume_paused  # the auth callback calls it after login

    register_error_handlers(app)
    _include_routers(app)
    _mount_web(app, web_dist)
    return app


def _log_worker_exit(task: asyncio.Task[None]) -> None:
    """The worker loop is meant to run forever; anything but cancellation is a bug."""
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        log.error("job worker stopped unexpectedly", exc_info=exc)


def _include_routers(app: FastAPI) -> None:
    app.include_router(api)
    app.include_router(jobs.router)
    app.include_router(sync.router)
    app.include_router(events.router)
    app.include_router(auth_api.router)
    app.include_router(settings_api.router)


def _mount_web(app: FastAPI, web_dist: Path | None) -> None:
    index = web_dist / "index.html" if web_dist else None
    if index is None or not index.is_file():

        @app.get("/", include_in_schema=False, response_class=HTMLResponse)
        def alive() -> str:
            return _ALIVE_HTML

        return

    assets = web_dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = (web_dist / path).resolve() if path else index
        if path and candidate.is_file() and web_dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index)
