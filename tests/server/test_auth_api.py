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
    assert body["redirect_uri"] == "http://localhost:8765/api/auth/google/callback"
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
    assert "redirect_uri=http%3A%2F%2Flocalhost%3A8765%2Fapi%2Fauth%2Fgoogle%2Fcallback" in location
    assert "oauth_state" in response.cookies


def test_redirect_uri_follows_settings_port_not_host_header(
    workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    from beat_server.app import create_app
    from beat_server.db.engine import MEMORY
    from beat_server.db.models import Base
    from beat_server.settings import ServerSettings

    settings = ServerSettings(
        port=9999, data_dir=workspace.data_dir, config_dir=workspace.config_dir
    )
    app = create_app(workspace, settings, web_dist=None, db_path=MEMORY, migrate=False)
    Base.metadata.create_all(app.state.engine)
    with TestClient(app) as client:
        client.put("/api/settings/google", json=GOOGLE)
        assert client.get("/api/settings").json()["redirect_uri"] == (
            "http://localhost:9999/api/auth/google/callback"
        )
        response = client.get(
            "/api/auth/google/start", follow_redirects=False, headers={"host": "evil.example"}
        )
        assert "redirect_uri=http%3A%2F%2Flocalhost%3A9999%2F" in response.headers["location"]


@pytest.mark.parametrize("site", ["same-origin", "none"])
def test_start_allows_own_navigation(client: TestClient, site: str) -> None:
    client.put("/api/settings/google", json=GOOGLE)
    response = client.get(
        "/api/auth/google/start", follow_redirects=False, headers={"sec-fetch-site": site}
    )
    assert response.status_code == 307


@pytest.mark.parametrize("site", ["cross-site", "same-site"])
def test_start_refuses_foreign_navigation(client: TestClient, site: str) -> None:
    client.put("/api/settings/google", json=GOOGLE)
    response = client.get(
        "/api/auth/google/start", follow_redirects=False, headers={"sec-fetch-site": site}
    )
    assert response.status_code == 403


def test_csrf_rejects_cross_site_posts(client: TestClient) -> None:
    foreign = {"origin": "http://evil.example"}
    assert client.post("/api/auth/disconnect", headers=foreign).status_code == 403
    assert client.put("/api/settings/google", json=GOOGLE, headers=foreign).status_code == 403
    by_fetch_site = {"sec-fetch-site": "cross-site"}
    assert client.post("/api/auth/disconnect", headers=by_fetch_site).status_code == 403
    assert client.post("/api/auth/disconnect", headers={"origin": "null"}).status_code == 403
    # Safe methods and non-API paths are not the middleware's business.
    assert client.get("/api/auth/status", headers=foreign).status_code == 200
    assert client.get("/", headers=foreign).status_code == 200


def test_csrf_allows_same_origin_and_missing_origin(client: TestClient) -> None:
    same = {"origin": "http://testserver", "sec-fetch-site": "same-origin"}
    assert client.post("/api/auth/disconnect", headers=same).status_code == 204
    mixed_case = {"origin": "HTTP://TestServer"}
    assert client.post("/api/auth/disconnect", headers=mixed_case).status_code == 204
    assert client.post("/api/auth/disconnect").status_code == 204  # curl / tests


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
    assert seen["redirect_uri"] == "http://localhost:8765/api/auth/google/callback"
    assert seen["response_url"].endswith("/api/auth/google/callback?state=whatever&code=abc")
    assert reconnected == [True]
    assert "oauth_state" not in response.cookies or not response.cookies["oauth_state"]

    status = client.get("/api/auth/status").json()
    assert status == {"status": "connected", "channel": {"id": "UC1", "title": "My Beats"}}


def test_callback_passes_fresh_credentials_to_channel_lookup(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    client.put("/api/settings/google", json=GOOGLE)
    client.get("/api/auth/google/start", follow_redirects=False)
    token = object()
    received: list[object] = []

    class RecordingStats(FakeStats):
        def __init__(self, credentials: object) -> None:
            received.append(credentials)

    def fake_finish(ws: Workspace, redirect_uri: str, state: str, response_url: str) -> object:
        write_valid_token(ws)
        return token

    monkeypatch.setattr("beat_server.api.auth.finish_web_flow", fake_finish)
    monkeypatch.setattr("beat_server.api.auth.YouTubeStats", RecordingStats)
    client.get("/api/auth/google/callback?state=x&code=abc", follow_redirects=False)
    assert received == [token]


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


def test_status_connected_without_channel_when_google_unreachable(
    client: TestClient, workspace: Workspace, monkeypatch: pytest.MonkeyPatch
) -> None:
    from google.auth.exceptions import TransportError
    from google.oauth2.credentials import Credentials

    client.put("/api/settings/google", json=GOOGLE)
    write_valid_token(workspace)
    expired = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1)
    payload = json.loads(workspace.token_file.read_text(encoding="utf-8"))
    payload["expiry"] = expired.strftime("%Y-%m-%dT%H:%M:%SZ")
    workspace.token_file.write_text(json.dumps(payload), encoding="utf-8")

    def offline_refresh(self: Credentials, request: object) -> None:
        raise TransportError("offline")

    monkeypatch.setattr(Credentials, "refresh", offline_refresh)
    FakeStats.calls = 0
    monkeypatch.setattr("beat_server.api.auth.YouTubeStats", FakeStats)
    assert client.get("/api/auth/status").json() == {"status": "connected", "channel": None}
    assert FakeStats.calls == 0


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
