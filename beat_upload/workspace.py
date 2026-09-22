"""Where one channel owner's data lives on disk.

Nothing here touches the filesystem: constructing a ``Workspace`` never creates directories.
Callers that write (``auth.save_token``, the server) create what they need.
"""

from dataclasses import dataclass
from pathlib import Path

from platformdirs import user_config_dir, user_data_dir

APP_NAME = "beat-upload"


@dataclass(frozen=True)
class Workspace:
    """Everything one channel owner owns on disk. One per machine today."""

    config_dir: Path  # client secrets, token   (~/.config/beat-upload)
    data_dir: Path  # sqlite, beat files       (~/.local/share/beat-upload)

    @classmethod
    def default(cls) -> "Workspace":
        return cls(
            config_dir=Path(user_config_dir(APP_NAME)),
            data_dir=Path(user_data_dir(APP_NAME)),
        )

    @property
    def token_file(self) -> Path:
        return self.config_dir / "token.json"

    @property
    def secrets_file(self) -> Path:
        return self.config_dir / "client_secrets.json"

    @property
    def db_file(self) -> Path:
        return self.data_dir / "beat-upload.sqlite3"

    def beat_dir(self, beat_id: str) -> Path:
        return self.data_dir / "beats" / beat_id
