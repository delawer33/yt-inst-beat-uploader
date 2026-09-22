"""Google OAuth2 credentials: client secrets and the user token.

Both files live in the platform config directory (``~/.config/beat-upload`` on Linux).
"""

import json
from pathlib import Path
from typing import cast

import google_auth_oauthlib.flow
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from platformdirs import user_config_dir

from beat_upload.errors import AuthError

APP_NAME = "beat-upload"

CONFIG_DIR = Path(user_config_dir(APP_NAME, ensure_exists=True))
TOKEN_FILE = CONFIG_DIR / "token.json"
SECRETS_FILE = CONFIG_DIR / "client_secrets.json"

SCOPES = [
    # Upload, read and edit videos (privacy status). Supersedes youtube.upload/readonly.
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
]

_LOGIN_HINT = "Run `beat-upload login` first."


def save_client_secrets(client_id: str, client_secret: str) -> None:
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
    SECRETS_FILE.write_text(json.dumps(secrets, indent=2), encoding="utf-8")


def run_login_flow() -> Credentials:
    """Open the browser for user consent and persist the resulting token."""
    if not SECRETS_FILE.exists():
        raise AuthError(f"Client secrets not found at {SECRETS_FILE}. {_LOGIN_HINT}")

    flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
        str(SECRETS_FILE), SCOPES
    )
    creds = cast(Credentials, flow.run_local_server(port=0))
    _save_token(creds)
    return creds


def get_valid_credentials() -> Credentials:
    """Load the stored token, refreshing it if expired."""
    if not TOKEN_FILE.exists():
        raise AuthError(f"Not logged in. {_LOGIN_HINT}")

    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
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
        _save_token(creds)
        return creds

    raise AuthError(f"Stored credentials are invalid or revoked. {_LOGIN_HINT}")


def _save_token(creds: Credentials) -> None:
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
