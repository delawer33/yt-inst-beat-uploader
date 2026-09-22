"""Settings: the Google OAuth client (secret write-only) and scheduler options.

Keys in ``SettingsRepo``: ``stats_hour`` (hour of day, 0..23, for the daily stats job; the
scheduler slice reads it, default ``DEFAULT_STATS_HOUR``). The Google client id and secret
are not in the database: they live in the Workspace secrets file via ``auth``.
"""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from beat_server.db.repo import SettingsRepo
from beat_server.deps import get_session, get_workspace
from beat_upload.auth import save_client_secrets
from beat_upload.workspace import Workspace

router = APIRouter(prefix="/api/settings", tags=["settings"])

KEY_STATS_HOUR = "stats_hour"
DEFAULT_STATS_HOUR = 4

WorkspaceDep = Annotated[Workspace, Depends(get_workspace)]
SessionDep = Annotated[Session, Depends(get_session)]


class SettingsOut(BaseModel):
    google_client_id: str | None
    stats_hour: int
    port: int
    redirect_uri: str  # what to register on the Google OAuth client


class SettingsIn(BaseModel):
    stats_hour: int = Field(ge=0, le=23)


class GoogleClientIn(BaseModel):
    client_id: str = Field(min_length=1)
    client_secret: str = Field(min_length=1)

    @field_validator("client_id", "client_secret")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


def stored_client_id(ws: Workspace) -> str | None:
    if not ws.secrets_file.is_file():
        return None
    try:
        config = json.loads(ws.secrets_file.read_text(encoding="utf-8"))
    except ValueError:
        return None
    for kind in ("installed", "web"):
        client_id = config.get(kind, {}).get("client_id")
        if client_id:
            return str(client_id)
    return None


def stats_hour(settings: SettingsRepo) -> int:
    raw = settings.get(KEY_STATS_HOUR)
    return int(raw) if raw is not None else DEFAULT_STATS_HOUR


def _out(request: Request, ws: Workspace, settings: SettingsRepo) -> SettingsOut:
    server = request.app.state.settings
    return SettingsOut(
        google_client_id=stored_client_id(ws),
        stats_hour=stats_hour(settings),
        port=server.port,
        redirect_uri=server.redirect_uri,
    )


@router.get("", response_model=SettingsOut)
def get_settings(request: Request, ws: WorkspaceDep, session: SessionDep) -> SettingsOut:
    return _out(request, ws, SettingsRepo(session))


@router.put("", response_model=SettingsOut)
def put_settings(
    body: SettingsIn, request: Request, ws: WorkspaceDep, session: SessionDep
) -> SettingsOut:
    settings = SettingsRepo(session)
    settings.set(KEY_STATS_HOUR, str(body.stats_hour))
    return _out(request, ws, settings)


@router.put("/google", status_code=204)
def put_google(body: GoogleClientIn, ws: WorkspaceDep) -> Response:
    save_client_secrets(ws, body.client_id, body.client_secret)
    return Response(status_code=204)
