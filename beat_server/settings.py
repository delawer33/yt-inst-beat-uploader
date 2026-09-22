"""Server settings: port, host and optional overrides of the Workspace directories."""

import os
from dataclasses import dataclass
from pathlib import Path

from beat_upload.auth import REDIRECT_PATH
from beat_upload.workspace import Workspace

DEFAULT_PORT = 8765
DEFAULT_HOST = "127.0.0.1"
# Host name the browser uses. Google accepts ``http://localhost`` redirect URIs (not
# ``127.0.0.1``), so the origin is fixed to ``localhost`` regardless of the bind host.
PUBLIC_HOST = "localhost"

ENV_DATA_DIR = "BEAT_UPLOAD_DATA_DIR"
ENV_CONFIG_DIR = "BEAT_UPLOAD_CONFIG_DIR"
ENV_PORT = "BEAT_UPLOAD_PORT"


@dataclass(frozen=True)
class ServerSettings:
    port: int = DEFAULT_PORT
    host: str = DEFAULT_HOST
    data_dir: Path | None = None  # overrides Workspace.default().data_dir
    config_dir: Path | None = None  # overrides Workspace.default().config_dir

    @classmethod
    def from_env(cls, *, port: int | None = None) -> "ServerSettings":
        env_port = os.environ.get(ENV_PORT)
        data_dir = os.environ.get(ENV_DATA_DIR)
        config_dir = os.environ.get(ENV_CONFIG_DIR)
        return cls(
            port=port if port is not None else int(env_port) if env_port else DEFAULT_PORT,
            data_dir=Path(data_dir) if data_dir else None,
            config_dir=Path(config_dir) if config_dir else None,
        )

    @property
    def public_origin(self) -> str:
        """Origin the user opens in the browser, e.g. ``http://localhost:8765``."""
        return f"http://{PUBLIC_HOST}:{self.port}"

    @property
    def redirect_uri(self) -> str:
        """OAuth redirect URI; must be registered on the Google OAuth client verbatim."""
        return self.public_origin + REDIRECT_PATH

    def workspace(self) -> Workspace:
        default = Workspace.default()
        return Workspace(
            config_dir=self.config_dir or default.config_dir,
            data_dir=self.data_dir or default.data_dir,
        )
