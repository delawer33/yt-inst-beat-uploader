"""Web OAuth helpers in ``beat_upload.auth``: status detection and the authorization URL.

Nothing here talks to Google: tokens are JSON files under ``tmp_path`` and refresh is
monkeypatched where a network round-trip would happen.
"""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials

from beat_upload import auth
from beat_upload.auth import AuthStatus
from beat_upload.errors import AuthError
from beat_upload.workspace import Workspace

REDIRECT = "http://localhost:8765/api/auth/google/callback"


@pytest.fixture
def ws(tmp_path: Path) -> Workspace:
    return Workspace(config_dir=tmp_path / "cfg", data_dir=tmp_path / "data")


@pytest.fixture
def configured(ws: Workspace) -> Workspace:
    auth.save_client_secrets(ws, "id", "secret")
    return ws


def write_token(ws: Workspace, *, expires_in: timedelta, refresh_token: str | None = "r") -> None:
    expiry = datetime.now(UTC).replace(tzinfo=None) + expires_in
    payload = {
        "token": "access",
        "refresh_token": refresh_token,
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": "id",
        "client_secret": "secret",
        "scopes": auth.SCOPES,
        "expiry": expiry.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    ws.config_dir.mkdir(parents=True, exist_ok=True)
    ws.token_file.write_text(json.dumps(payload), encoding="utf-8")


def test_status_not_configured_without_secrets(ws: Workspace) -> None:
    assert auth.auth_status(ws) is AuthStatus.NOT_CONFIGURED


def test_status_not_connected_without_token(configured: Workspace) -> None:
    assert auth.auth_status(configured) is AuthStatus.NOT_CONNECTED


def test_status_connected_with_valid_token(configured: Workspace) -> None:
    write_token(configured, expires_in=timedelta(days=365))
    assert auth.auth_status(configured) is AuthStatus.CONNECTED


def test_status_expired_when_refresh_fails(
    configured: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    write_token(configured, expires_in=timedelta(days=-1))

    def failing_refresh(self: Credentials, request: object) -> None:
        raise RefreshError("invalid_grant: Token has been expired or revoked.")

    monkeypatch.setattr(Credentials, "refresh", failing_refresh)
    assert auth.auth_status(configured) is AuthStatus.EXPIRED
    with pytest.raises(AuthError, match="Could not refresh"):
        auth.get_valid_credentials(configured)


def test_status_expired_when_token_is_garbage(configured: Workspace) -> None:
    configured.token_file.write_text("not json", encoding="utf-8")
    assert auth.auth_status(configured) is AuthStatus.EXPIRED


def test_authorization_url_contains_redirect_and_scopes(configured: Workspace) -> None:
    url, state = auth.authorization_url(configured, REDIRECT)
    query = parse_qs(urlparse(url).query)
    assert state
    assert query["state"] == [state]
    assert query["redirect_uri"] == [REDIRECT]
    assert query["access_type"] == ["offline"]
    assert query["prompt"] == ["consent"]
    for scope in auth.SCOPES:
        assert scope in query["scope"][0]


def test_authorization_url_without_secrets_raises(ws: Workspace) -> None:
    with pytest.raises(AuthError, match="Settings"):
        auth.authorization_url(ws, REDIRECT)


def test_disconnect_removes_token(configured: Workspace) -> None:
    write_token(configured, expires_in=timedelta(days=1))
    auth.disconnect(configured)
    assert not configured.token_file.exists()
    auth.disconnect(configured)  # idempotent
    assert auth.auth_status(configured) is AuthStatus.NOT_CONNECTED


def test_finish_web_flow_rejects_mismatching_state(configured: Workspace) -> None:
    with pytest.raises(AuthError, match="mismatching_state"):
        auth.finish_web_flow(configured, REDIRECT, "expected", f"{REDIRECT}?state=other&code=1")
    assert not configured.token_file.exists()
