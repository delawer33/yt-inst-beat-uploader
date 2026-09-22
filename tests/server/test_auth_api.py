"""``/api/auth/*`` and ``/api/settings``: offline, tmp Workspace, in-memory sqlite."""

import json
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from beat_server.db.repo import SettingsRepo
from beat_upload import auth
from beat_upload.errors import UploadError
from beat_upload.stats import ChannelStats
from beat_upload.workspace import Workspace

GOOGLE = {"client_id": "id.apps.googleusercontent.com", "client_secret": "top-secret"}


def write_valid_token(ws: Workspace) -> None:
    expiry = datetime.now(UTC).replace(tzinfo=None) + timedelta(days=30)
    payload = {
        "token": "access",
        "refresh_token": "r",
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": "id",
        "client_secret": "secret",
        "scopes": auth.SCOPES,
        "expiry": expiry.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    ws.config_dir.mkdir(parents=True, exist_ok=True)
    ws.token_file.write_text(json.dumps(payload), encoding="utf-8")


class FakeStats:
    calls = 0

    def __init__(self, credentials: object) -> None:
        pass

    def channel(self) -> ChannelStats:
        FakeStats.calls += 1
        return ChannelStats(
            id="UC1", title="My Beats", subscribers=1, views=2, videos=3, uploads_playlist="UU1"
        )


class FailingStats(FakeStats):
    def channel(self) -> ChannelStats:
        raise UploadError("YouTube API error: quota")


def test_start_without_secrets_is_409(client: TestClient) -> None:
    response = client.get("/api/auth/google/start", follow_redirects=False)
    assert response.status_code == 409
    assert "Settings" in response.json()["detail"]


def test_status_not_configured(client: TestClient) -> None:
    response = client.get("/api/auth/status")
    assert response.status_code == 200
    assert response.json() == {"status": "not_configured", "channel": None}


def test_put_google_then_get_settings_hides_secret(
    client: TestClient, workspace: Workspace
) -> None:
    assert client.put("/api/settings/google", json=GOOGLE).status_code == 204
    assert workspace.secrets_file.is_file()

    response = client.get("/api/settings")
    assert response.status_code == 200
    body = response.json()
    assert body["google_client_id"] == GOOGLE["client_id"]
    assert body["stats_hour"] == 4
    assert body["port"] == 8765
    assert "top-secret" not in response.text
    assert client.get("/api/auth/status").json()["status"] == "not_connected"


def test_put_google_rejects_blank(client: TestClient) -> None:
    response = client.put("/api/settings/google", json={"client_id": " ", "client_secret": "x"})
    assert response.status_code == 422


def test_put_settings_stats_hour(client: TestClient) -> None:
    response = client.put("/api/settings", json={"stats_hour": 23})
    assert response.status_code == 200
    assert response.json()["stats_hour"] == 23
    assert client.get("/api/settings").json()["stats_hour"] == 23
    assert client.put("/api/settings", json={"stats_hour": 24}).status_code == 422


def test_start_redirects_to_google_with_state_cookie(client: TestClient) -> None:
    client.put("/api/settings/google", json=GOOGLE)
    response = client.get("/api/auth/google/start", follow_redirects=False)
    assert response.status_code == 307
    location = response.headers["location"]
    assert location.startswith("https://accounts.google.com/o/oauth2/auth")
    assert "redirect_uri=http%3A%2F%2Ftestserver%2Fapi%2Fauth%2Fgoogle%2Fcallback" in location
    assert "oauth_state" in response.cookies


def test_callback_without_state_redirects_with_error(client: TestClient) -> None:
    client.put("/api/settings/google", json=GOOGLE)
    response = client.get("/api/auth/google/callback?code=abc", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"].startswith("/settings?error=")


def test_callback_finishes_flow_and_calls_on_reconnect(
    client: TestClient, app: FastAPI, workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.put("/api/settings/google", json=GOOGLE)
    client.get("/api/auth/google/start", follow_redirects=False)  # sets the state cookie
    reconnected: list[bool] = []
    app.state.on_reconnect = lambda: reconnected.append(True)
    seen: dict[str, str] = {}

    def fake_finish(ws: Workspace, redirect_uri: str, state: str, response_url: str) -> object:
        seen.update(redirect_uri=redirect_uri, state=state, response_url=response_url)
        write_valid_token(ws)
        return object()

    monkeypatch.setattr("beat_server.api.auth.finish_web_flow", fake_finish)
    monkeypatch.setattr("beat_server.api.auth.YouTubeStats", FakeStats)

    response = client.get(
        "/api/auth/google/callback?state=whatever&code=abc", follow_redirects=False
    )
    assert response.status_code == 302
    assert response.headers["location"] == "/settings?connected=1"
    assert seen["redirect_uri"] == "http://testserver/api/auth/google/callback"
    assert seen["response_url"].endswith("/api/auth/google/callback?state=whatever&code=abc")
    assert reconnected == [True]
    assert "oauth_state" not in response.cookies or not response.cookies["oauth_state"]

    status = client.get("/api/auth/status").json()
    assert status == {"status": "connected", "channel": {"id": "UC1", "title": "My Beats"}}


def test_status_caches_channel(
    client: TestClient, app: FastAPI, workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.put("/api/settings/google", json=GOOGLE)
    write_valid_token(workspace)
    FakeStats.calls = 0
    monkeypatch.setattr("beat_server.api.auth.YouTubeStats", FakeStats)

    first = client.get("/api/auth/status").json()
    second = client.get("/api/auth/status").json()
    assert first == second
    assert first["channel"]["title"] == "My Beats"
    assert FakeStats.calls == 1
    with app.state.session_factory() as session:
        assert SettingsRepo(session).get("channel_title") == "My Beats"


def test_status_connected_even_when_channel_lookup_fails(
    client: TestClient, workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.put("/api/settings/google", json=GOOGLE)
    write_valid_token(workspace)
    monkeypatch.setattr("beat_server.api.auth.YouTubeStats", FailingStats)

    assert client.get("/api/auth/status").json() == {"status": "connected", "channel": None}


def test_disconnect_deletes_token_and_cache(
    client: TestClient, app: FastAPI, workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.put("/api/settings/google", json=GOOGLE)
    write_valid_token(workspace)
    monkeypatch.setattr("beat_server.api.auth.YouTubeStats", FakeStats)
    client.get("/api/auth/status")

    assert client.post("/api/auth/disconnect").status_code == 204
    assert not workspace.token_file.exists()
    assert client.get("/api/auth/status").json() == {"status": "not_connected", "channel": None}
    with app.state.session_factory() as session:
        assert SettingsRepo(session).get("channel_title") is None
    assert client.post("/api/auth/disconnect").status_code == 204
