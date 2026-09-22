"""Google OAuth2 credentials: client secrets and the user token.

Both files live in the ``Workspace`` config directory (``~/.config/beat-upload`` on Linux).
"""

import json
import os
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import cast
from urllib.parse import parse_qs, urlparse

import google_auth_oauthlib.flow
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from oauthlib.oauth2 import OAuth2Error

from beat_upload.errors import AuthError, NetworkError
from beat_upload.workspace import APP_NAME, Workspace

__all__ = [
    "APP_NAME",
    "REDIRECT_PATH",
    "SCOPES",
    "AuthState",
    "AuthStatus",
    "auth_state",
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
# from its settings (``ServerSettings.redirect_uri``) and must match a redirect URI of the
# Google OAuth client.
REDIRECT_PATH = "/api/auth/google/callback"

# Secrets and tokens are readable by the owner only.
DIR_MODE = 0o700
FILE_MODE = 0o600

_LOGIN_HINT = "Run `beat-upload login` first."
_SETTINGS_HINT = "Enter the Google client id and secret in Settings first."


class AuthStatus(StrEnum):
    NOT_CONFIGURED = "not_configured"  # no client secrets stored
    NOT_CONNECTED = "not_connected"  # secrets stored, no token
    CONNECTED = "connected"  # token valid (or refreshed just now)
    EXPIRED = "expired"  # token present but refresh failed / revoked


@dataclass(frozen=True)
class AuthState:
    """Status for the UI plus the credentials behind it, loaded once.

    ``credentials`` is ``None`` unless ``status`` is ``CONNECTED``, and may also be ``None``
    while ``CONNECTED`` when the token is expired and Google could not be reached to refresh
    it: that is a network hiccup, not a revoked connection.
    """

    status: AuthStatus
    credentials: Credentials | None = None


def _write_private(path: Path, text: str) -> None:
    """Create ``path`` (and its directory) readable by the owner only, then write ``text``."""
    path.parent.mkdir(parents=True, exist_ok=True, mode=DIR_MODE)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, FILE_MODE)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        os.fchmod(fd, FILE_MODE)  # an existing file keeps its mode on open; force it
        f.write(text)


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
    _write_private(ws.secrets_file, json.dumps(secrets, indent=2))


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
        except TransportError as e:
            raise NetworkError(f"Could not reach Google to refresh credentials: {e}") from e
        except GoogleAuthError as e:
            reason = e.args[0] if e.args else e
            raise AuthError(f"Could not refresh credentials: {reason} {_LOGIN_HINT}") from e
        save_token(ws, creds)
        return creds

    raise AuthError(f"Stored credentials are invalid or revoked. {_LOGIN_HINT}")


def save_token(ws: Workspace, creds: Credentials) -> None:
    _write_private(ws.token_file, creds.to_json())


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
    """Exchange the code Google sent to ``response_url`` for a token and persist it.

    The code and state are read here instead of handing ``response_url`` to oauthlib: its
    parser refuses a plain-http redirect unless ``OAUTHLIB_INSECURE_TRANSPORT`` is set
    process-wide, and the token request itself goes to Google's https endpoint anyway.
    """
    code = _authorization_code(state, response_url)
    flow = web_flow(ws, redirect_uri, state=state)
    try:
        flow.fetch_token(code=code)
    except (GoogleAuthError, OAuth2Error, ValueError, OSError) as e:
        reason = e.args[0] if e.args else e
        raise AuthError(f"Google did not accept the authorization: {reason}") from e
    creds = cast(Credentials, flow.credentials)
    save_token(ws, creds)
    return creds


def _authorization_code(state: str, response_url: str) -> str:
    query = parse_qs(urlparse(response_url).query)
    if "error" in query:
        raise AuthError(f"Google did not grant access: {query['error'][0]}")
    if query.get("state", [None])[0] != state:
        raise AuthError("The sign-in response does not match the sign-in attempt (state mismatch).")
    code = query.get("code", [""])[0]
    if not code:
        raise AuthError("Google sent no authorization code. Try again.")
    return code


def auth_state(ws: Workspace) -> AuthState:
    """What the UI shows plus the credentials. Never raises; refreshes the token if needed."""
    if not ws.secrets_file.exists():
        return AuthState(AuthStatus.NOT_CONFIGURED)
    if not ws.token_file.exists():
        return AuthState(AuthStatus.NOT_CONNECTED)
    try:
        creds = get_valid_credentials(ws)
    except NetworkError:  # token still there, Google unreachable: not our problem to report
        return AuthState(AuthStatus.CONNECTED)
    except AuthError:
        return AuthState(AuthStatus.EXPIRED)
    except (ValueError, OSError):  # unreadable or malformed token file
        return AuthState(AuthStatus.EXPIRED)
    return AuthState(AuthStatus.CONNECTED, creds)


def auth_status(ws: Workspace) -> AuthStatus:
    return auth_state(ws).status


def disconnect(ws: Workspace) -> None:
    """Forget the token. The client secrets stay; connecting again needs no re-entry."""
    ws.token_file.unlink(missing_ok=True)
