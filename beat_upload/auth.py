"""Google OAuth2 credentials: client secrets and the user token.

Both files live in the ``Workspace`` config directory (``~/.config/beat-upload`` on Linux).
"""

import json
from typing import cast

import google_auth_oauthlib.flow
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

from beat_upload.errors import AuthError
from beat_upload.workspace import APP_NAME, Workspace

__all__ = [
    "APP_NAME",
    "SCOPES",
    "get_valid_credentials",
    "run_login_flow",
    "save_client_secrets",
    "save_token",
]

SCOPES = [
    # Upload, read and edit videos (privacy status). Supersedes youtube.upload/readonly.
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]

_LOGIN_HINT = "Run `beat-upload login` first."


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
