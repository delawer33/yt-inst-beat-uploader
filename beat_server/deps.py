"""FastAPI dependencies. Everything comes off ``app.state``, set up in ``create_app``."""

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy.orm import Session

from beat_upload.workspace import Workspace


def get_workspace(request: Request) -> Workspace:
    return request.app.state.workspace


def get_session(request: Request) -> Iterator[Session]:
    session: Session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()
