"""Google connection: status, OAuth start/callback, disconnect.

The OAuth ``state`` travels in a signed, short-lived cookie (itsdangerous) so the callback
can verify it without server-side storage. The signing secret (``app.state.oauth_state_secret``)
is generated per process in ``create_app``: a state older than the server run is useless anyway.

The redirect URI is ``ServerSettings.redirect_uri`` (``http://localhost:PORT`` + path), not
derived from the ``Host`` header, so a spoofed Host cannot steer the flow and the value the
user registers at Google is the one shown in Settings.

``GET /google/start`` is a browser navigation, so it is not covered by the CSRF middleware's
Origin check; it refuses ``Sec-Fetch-Site`` other than ``same-origin``/``none`` instead.

The channel title is cached in ``SettingsRepo`` (keys ``channel_id``, ``channel_title``) so
``GET /api/auth/status`` does not hit the Data API on every poll. The cache is refreshed on
a successful callback and cleared on disconnect.

Hook for the jobs slice: after a successful callback the router calls
``request.app.state.on_reconnect()`` if that attribute exists. The worker sets it to a
callable that re-queues jobs paused on ``AuthError``.
"""

from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from google.oauth2.credentials import Credentials
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from beat_server.db.repo import SettingsRepo
from beat_server.deps import get_session, get_workspace
from beat_upload.auth import (
    AuthStatus,
    auth_state,
    authorization_url,
    disconnect,
    finish_web_flow,
)
from beat_upload.errors import BeatUploadError
from beat_upload.stats import YouTubeStats
from beat_upload.workspace import Workspace

router = APIRouter(prefix="/api/auth", tags=["auth"])

STATE_COOKIE = "oauth_state"
STATE_MAX_AGE = 10 * 60  # seconds the user has to finish the consent screen
SETTINGS_PAGE = "/settings"
KEY_CHANNEL_ID = "channel_id"
KEY_CHANNEL_TITLE = "channel_title"
# Sec-Fetch-Site values a browser sends for a navigation we started (link click, typed URL).
START_ALLOWED_SITES = frozenset({"same-origin", "none"})

WorkspaceDep = Annotated[Workspace, Depends(get_workspace)]
SessionDep = Annotated[Session, Depends(get_session)]


class ChannelOut(BaseModel):
    id: str
    title: str


class AuthStatusOut(BaseModel):
    status: AuthStatus
    channel: ChannelOut | None


def redirect_uri_for(request: Request) -> str:
    return str(request.app.state.settings.redirect_uri)


def _signer(request: Request) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(request.app.state.oauth_state_secret, salt=STATE_COOKIE)


def _cached_channel(settings: SettingsRepo) -> ChannelOut | None:
    channel_id = settings.get(KEY_CHANNEL_ID)
    title = settings.get(KEY_CHANNEL_TITLE)
    if channel_id is None or title is None:
        return None
    return ChannelOut(id=channel_id, title=title)


def _fetch_channel(creds: Credentials, settings: SettingsRepo) -> ChannelOut | None:
    """One Data API call; ``None`` when it fails so status never 500s over a channel title."""
    try:
        channel = YouTubeStats(creds).channel()
    except BeatUploadError:
        return None
    settings.set(KEY_CHANNEL_ID, channel.id)
    settings.set(KEY_CHANNEL_TITLE, channel.title)
    return ChannelOut(id=channel.id, title=channel.title)


def _clear_channel(settings: SettingsRepo) -> None:
    settings.delete(KEY_CHANNEL_ID)
    settings.delete(KEY_CHANNEL_TITLE)


@router.get("/status", response_model=AuthStatusOut)
def status(ws: WorkspaceDep, session: SessionDep) -> AuthStatusOut:
    current = auth_state(ws)
    if current.status is not AuthStatus.CONNECTED:
        return AuthStatusOut(status=current.status, channel=None)
    settings = SettingsRepo(session)
    channel = _cached_channel(settings)
    if channel is None and current.credentials is not None:
        channel = _fetch_channel(current.credentials, settings)
    return AuthStatusOut(status=current.status, channel=channel)


@router.get("/google/start", status_code=307, response_class=RedirectResponse)
def google_start(request: Request, ws: WorkspaceDep) -> RedirectResponse:
    site = request.headers.get("sec-fetch-site")
    if site is not None and site.lower() not in START_ALLOWED_SITES:
        raise HTTPException(status_code=403, detail="Cross-site request refused")
    url, state = authorization_url(ws, redirect_uri_for(request))  # AuthError -> 409
    response = RedirectResponse(url, status_code=307)
    response.set_cookie(
        STATE_COOKIE,
        _signer(request).dumps(state),
        max_age=STATE_MAX_AGE,
        httponly=True,
        samesite="lax",
    )
    return response


@router.get("/google/callback", status_code=302, response_class=RedirectResponse)
def google_callback(request: Request, ws: WorkspaceDep, session: SessionDep) -> RedirectResponse:
    try:
        state = _read_state(request)
        creds = finish_web_flow(ws, redirect_uri_for(request), state, str(request.url))
    except BeatUploadError as e:
        return _to_settings(error=str(e))

    settings = SettingsRepo(session)
    _clear_channel(settings)
    _fetch_channel(creds, settings)
    on_reconnect = getattr(request.app.state, "on_reconnect", None)
    if callable(on_reconnect):
        on_reconnect()
    return _to_settings(connected=True)


@router.post("/disconnect", status_code=204)
def google_disconnect(ws: WorkspaceDep, session: SessionDep) -> Response:
    disconnect(ws)
    _clear_channel(SettingsRepo(session))
    return Response(status_code=204)


def _read_state(request: Request) -> str:
    cookie = request.cookies.get(STATE_COOKIE)
    if not cookie:
        raise BeatUploadError("The sign-in attempt expired or was not started here. Try again.")
    try:
        return _signer(request).loads(cookie, max_age=STATE_MAX_AGE)
    except BadSignature as e:
        raise BeatUploadError("The sign-in attempt expired. Try again.") from e


def _to_settings(*, connected: bool = False, error: str | None = None) -> RedirectResponse:
    query = "connected=1" if connected else f"error={quote(error or '')}"
    response = RedirectResponse(f"{SETTINGS_PAGE}?{query}", status_code=302)
    response.delete_cookie(STATE_COOKIE)
    return response
