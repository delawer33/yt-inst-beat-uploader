"""Web OAuth helpers in ``beat_upload.auth``: status detection and the authorization URL.

Nothing here talks to Google: tokens are JSON files under ``tmp_path`` and refresh is
monkeypatched where a network round-trip would happen.
"""

import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
import requests
from google.auth.exceptions import RefreshError, TransportError
from google.oauth2.credentials import Credentials
from requests_oauthlib import OAuth2Session

from beat_upload import auth
from beat_upload.auth import AuthStatus
from beat_upload.errors import AuthError, NetworkError
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


def test_status_connected_when_google_unreachable(
    configured: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    write_token(configured, expires_in=timedelta(days=-1))

    def offline_refresh(self: Credentials, request: object) -> None:
        raise TransportError("Failed to establish a new connection")

    monkeypatch.setattr(Credentials, "refresh", offline_refresh)
    with pytest.raises(NetworkError, match="reach Google"):
        auth.get_valid_credentials(configured)
    state = auth.auth_state(configured)
    assert state.status is AuthStatus.CONNECTED
    assert state.credentials is None
    assert auth.auth_status(configured) is AuthStatus.CONNECTED


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
    with pytest.raises(AuthError, match="state"):
        auth.finish_web_flow(configured, REDIRECT, "expected", f"{REDIRECT}?state=other&code=1")
    assert not configured.token_file.exists()


def test_finish_web_flow_reports_google_error(configured: Workspace) -> None:
    with pytest.raises(AuthError, match="access_denied"):
        auth.finish_web_flow(configured, REDIRECT, "s", f"{REDIRECT}?state=s&error=access_denied")


TOKEN_RESPONSE = {
    "access_token": "access",
    "refresh_token": "r",
    "token_type": "Bearer",
    "expires_in": 3600,
    "scope": " ".join(auth.SCOPES),
}


def fake_token_response(method: str, url: str, **kw: Any) -> requests.Response:
    response = requests.Response()
    response.status_code = 200
    response.headers["content-type"] = "application/json"
    response._content = json.dumps(TOKEN_RESPONSE).encode()
    response.request = requests.Request(method, url, data=kw.get("data")).prepare()
    return response


def test_finish_web_flow_exchanges_code_over_http_without_env_var(
    configured: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Plain-http redirect URI must not require ``OAUTHLIB_INSECURE_TRANSPORT`` globally."""
    monkeypatch.delenv("OAUTHLIB_INSECURE_TRANSPORT", raising=False)
    sent: dict[str, Any] = {}

    def fake_request(self: OAuth2Session, method: str, url: str, **kw: Any) -> requests.Response:
        sent.update(method=method, url=url, data=kw.get("data"))
        return fake_token_response(method, url, **kw)

    monkeypatch.setattr(OAuth2Session, "request", fake_request)

    creds = auth.finish_web_flow(configured, REDIRECT, "s", f"{REDIRECT}?state=s&code=the-code")

    assert "OAUTHLIB_INSECURE_TRANSPORT" not in os.environ
    assert sent["url"] == "https://oauth2.googleapis.com/token"
    assert sent["data"]["code"] == "the-code"
    assert sent["data"]["redirect_uri"] == REDIRECT
    assert creds.token == "access"
    assert creds.refresh_token == "r"
    assert configured.token_file.is_file()
    assert auth.auth_status(configured) is AuthStatus.CONNECTED


def test_secrets_and_token_are_private(ws: Workspace) -> None:
    auth.save_client_secrets(ws, "id", "secret")
    assert ws.config_dir.stat().st_mode & 0o777 == 0o700
    assert ws.secrets_file.stat().st_mode & 0o777 == 0o600

    ws.token_file.write_text("{}", encoding="utf-8")
    ws.token_file.chmod(0o644)  # pre-existing wide-open file gets tightened
    creds = Credentials(
        token="t", refresh_token="r", token_uri="u", client_id="c", client_secret="s"
    )
    auth.save_token(ws, creds)
    assert ws.token_file.stat().st_mode & 0o777 == 0o600
    assert json.loads(ws.token_file.read_text(encoding="utf-8"))["token"] == "t"
