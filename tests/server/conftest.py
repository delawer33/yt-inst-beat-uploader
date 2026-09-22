"""Server test fixtures: tmp Workspace, in-memory sqlite, app and HTTP client.

The ``app`` is the root: ``engine`` and ``session`` come off ``app.state`` so a test can mix
HTTP calls and direct repo access against the same database. Tables come from
``Base.metadata.create_all``; the Alembic path has its own test.
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from beat_server.app import create_app
from beat_server.db.engine import MEMORY
from beat_server.db.models import Base
from beat_server.settings import ServerSettings
from beat_upload.workspace import Workspace


@pytest.fixture
def workspace(tmp_path: Path) -> Workspace:
    return Workspace(config_dir=tmp_path / "config", data_dir=tmp_path / "data")


@pytest.fixture
def settings(workspace: Workspace) -> ServerSettings:
    return ServerSettings(data_dir=workspace.data_dir, config_dir=workspace.config_dir)


@pytest.fixture
def app(workspace: Workspace, settings: ServerSettings) -> FastAPI:
    app = create_app(
        workspace,
        settings,
        web_dist=None,
        db_path=MEMORY,
        migrate=False,
        start_worker=False,
        start_scheduler=False,
    )
    Base.metadata.create_all(app.state.engine)
    return app


@pytest.fixture
def engine(app: FastAPI) -> Engine:
    return app.state.engine


@pytest.fixture
def session(app: FastAPI) -> Iterator[Session]:
    session: Session = app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client
