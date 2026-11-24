"""Where one channel owner's data lives on disk.

Nothing here touches the filesystem: constructing a ``Workspace`` never creates directories.
Callers that write (``auth.save_token``, the server) create what they need.
"""

import shutil
from dataclasses import dataclass
from pathlib import Path

from platformdirs import user_config_dir, user_data_dir

from beat_upload.errors import DiskFullError

APP_NAME = "beat-upload"

# A render writes a ``.part`` video next to the beat, a Track Package a WAV and a stems zip;
# a full drive fails SQLite commits as well, which the worker cannot survive cleanly
# (2026-11-17: the root drive filled mid-run). Refuse the heavy work before that point.
MIN_FREE_BYTES = 2 * 1024**3


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

    @property
    def beatstars_profile(self) -> Path:
        """The browser profile that keeps the BeatStars Studio session."""
        return self.data_dir / "beatstars-profile"

    def beat_dir(self, beat_id: str) -> Path:
        return self.data_dir / "beats" / beat_id

    @property
    def bakes_dir(self) -> Path:
        """The baked loops of the object Effects (``visual/bake.py``), shared by every Beat."""
        return self.data_dir / "bakes"

    def free_bytes(self) -> int:
        """Free space on the drive of the data dir, or of its nearest existing parent."""
        path = self.data_dir
        while not path.exists():
            path = path.parent
        return shutil.disk_usage(path).free

    def require_free_space(self, what: str, minimum: int = MIN_FREE_BYTES) -> None:
        """``DiskFullError`` naming ``what`` is refused when the data drive has less than
        ``minimum`` bytes free."""
        free = self.free_bytes()
        if free < minimum:
            raise DiskFullError(
                f"Not enough disk space for {what}: {free / 1024**3:.1f} GB free on "
                f"{self.data_dir}, at least {minimum / 1024**3:.0f} GB needed. Free some space."
            )
