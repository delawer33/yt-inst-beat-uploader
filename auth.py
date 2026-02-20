import json
from pathlib import Path
from typing import cast

import google_auth_oauthlib.flow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from platformdirs import user_config_dir

APP_NAME = "beat-upload"

CONFIG_DIR = Path(user_config_dir(APP_NAME, ensure_exists=True))
TOKEN_FILE = CONFIG_DIR / "token.json"
SECRETS_FILE = CONFIG_DIR / "client_secrets.json"

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def save_client_secrets(client_id: str, client_secret: str) -> None:
    secrets = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
        }
    }
    SECRETS_FILE.write_text(json.dumps(secrets, indent=2), encoding="utf-8")


def run_login_flow() -> Credentials:
    if not SECRETS_FILE.exists():
        raise FileNotFoundError(
            f"Client secrets not found at {SECRETS_FILE}. "
            "Run `beat-upload login` first."
        )

    flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
        str(SECRETS_FILE), SCOPES
    )
    creds = cast(Credentials, flow.run_local_server(port=0))
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    return creds


def get_valid_credentials() -> Credentials:
    if not TOKEN_FILE.exists():
        raise RuntimeError(
            "Not logged in. Run `beat-upload login --client-id <id> --client-secret <secret>` first."
        )

    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    if creds.valid:
        return creds

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
        return creds

    raise RuntimeError(
        "Stored credentials are invalid or revoked. Run `beat-upload login` again."
    )
