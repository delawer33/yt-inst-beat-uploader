"""Google OAuth2 credentials: client secrets and the user token.

Both files live in the ``Workspace`` config directory (``~/.config/beat-upload`` on Linux).
"""

import json
import os
from enum import StrEnum
from typing import cast

import google_auth_oauthlib.flow
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from oauthlib.oauth2 import OAuth2Error

from beat_upload.errors import AuthError
from beat_upload.workspace import APP_NAME, Workspace

__all__ = [
    "APP_NAME",
    "REDIRECT_PATH",
    "SCOPES",
    "AuthStatus",
    "auth_status",
    "authorization_url",
    "disconnect",
    "finish_web_flow",
    "get_valid_credentials",
    "run_login_flow",
    "save_client_secrets",
    "save_token",
    "web_flow",
]

SCOPES = [
    # Upload, read and edit videos (privacy status). Supersedes youtube.upload/readonly.
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]

# Path of the OAuth callback on the local server; the full redirect URI is built by the server
# from the request base URL and must match a redirect URI of the Google OAuth client.
REDIRECT_PATH = "/api/auth/google/callback"

_LOGIN_HINT = "Run `beat-upload login` first."
_SETTINGS_HINT = "Enter the Google client id and secret in Settings first."


class AuthStatus(StrEnum):
    NOT_CONFIGURED = "not_configured"  # no client secrets stored
    NOT_CONNECTED = "not_connected"  # secrets stored, no token
    CONNECTED = "connected"  # token valid (or refreshed just now)
    EXPIRED = "expired"  # token present but refresh failed / revoked


def save_client_secrets(ws: Workspace, client_id: str, client_secret: str) -> None:
    """Write an "installed app" client-secrets file understood by google-auth-oauthlib."""
    secrets = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }
    ws.config_dir.mkdir(parents=True, exist_ok=True)
    ws.secrets_file.write_text(json.dumps(secrets, indent=2), encoding="utf-8")


def run_login_flow(ws: Workspace) -> Credentials:
    """Open the browser for user consent and persist the resulting token."""
    if not ws.secrets_file.exists():
        raise AuthError(f"Client secrets not found at {ws.secrets_file}. {_LOGIN_HINT}")

    flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
        str(ws.secrets_file), SCOPES
    )
    creds = cast(Credentials, flow.run_local_server(port=0))
    save_token(ws, creds)
    return creds


def get_valid_credentials(ws: Workspace) -> Credentials:
    """Load the stored token, refreshing it if expired."""
    if not ws.token_file.exists():
        raise AuthError(f"Not logged in. {_LOGIN_HINT}")

    creds = Credentials.from_authorized_user_file(str(ws.token_file), SCOPES)
    if not creds.has_scopes(SCOPES):
        raise AuthError(f"Stored token lacks required scopes. {_LOGIN_HINT}")
    if creds.valid:
        return creds

    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
        except GoogleAuthError as e:
            reason = e.args[0] if e.args else e
            raise AuthError(f"Could not refresh credentials: {reason} {_LOGIN_HINT}") from e
        save_token(ws, creds)
        return creds

    raise AuthError(f"Stored credentials are invalid or revoked. {_LOGIN_HINT}")


def save_token(ws: Workspace, creds: Credentials) -> None:
    ws.config_dir.mkdir(parents=True, exist_ok=True)
    ws.token_file.write_text(creds.to_json(), encoding="utf-8")


def web_flow(
    ws: Workspace, redirect_uri: str, *, state: str | None = None
) -> google_auth_oauthlib.flow.Flow:
    """OAuth flow for the browser UI: Google redirects back to ``redirect_uri`` on our server."""
    if not ws.secrets_file.exists():
        raise AuthError(f"Google client is not configured. {_SETTINGS_HINT}")
    config = json.loads(ws.secrets_file.read_text(encoding="utf-8"))
    flow = google_auth_oauthlib.flow.Flow.from_client_config(config, SCOPES, state=state)
    flow.redirect_uri = redirect_uri
    return flow


def authorization_url(ws: Workspace, redirect_uri: str) -> tuple[str, str]:
    """``(url, state)``: send the browser to ``url``; keep ``state`` to verify the callback."""
    flow = web_flow(ws, redirect_uri)
    url, state = flow.authorization_url(access_type="offline", prompt="consent")
    return url, state


def finish_web_flow(ws: Workspace, redirect_uri: str, state: str, response_url: str) -> Credentials:
    """Exchange the code Google sent to ``response_url`` for a token and persist it."""
    flow = web_flow(ws, redirect_uri, state=state)
    if redirect_uri.startswith("http://"):
        # The server is plain http on localhost; oauthlib insists on https unless told so.
        os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")
    try:
        flow.fetch_token(authorization_response=response_url)
    except (GoogleAuthError, OAuth2Error, ValueError, OSError) as e:
        reason = e.args[0] if e.args else e
        raise AuthError(f"Google did not accept the authorization: {reason}") from e
    creds = cast(Credentials, flow.credentials)
    save_token(ws, creds)
    return creds


def auth_status(ws: Workspace) -> AuthStatus:
    """What the UI shows. Never raises; refreshes the token if that is what it takes."""
    if not ws.secrets_file.exists():
        return AuthStatus.NOT_CONFIGURED
    if not ws.token_file.exists():
        return AuthStatus.NOT_CONNECTED
    try:
        get_valid_credentials(ws)
    except AuthError:
        return AuthStatus.EXPIRED
    except (ValueError, OSError):  # unreadable or malformed token file
        return AuthStatus.EXPIRED
    return AuthStatus.CONNECTED


def disconnect(ws: Workspace) -> None:
    """Forget the token. The client secrets stay; connecting again needs no re-entry."""
    ws.token_file.unlink(missing_ok=True)
