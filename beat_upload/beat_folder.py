"""Discovery of the files that make up a beat.

A *beat folder* contains exactly one audio file, exactly one cover image and a
``config.yaml``. The rendered video is written next to them as ``video.mp4``.
"""

from dataclasses import dataclass
from pathlib import Path

from beat_upload.errors import BeatFolderError

AUDIO_EXTENSIONS = frozenset({".mp3", ".wav"})
IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".gif", ".bmp"})

CONFIG_FILENAME = "config.yaml"
VIDEO_FILENAME = "video.mp4"


@dataclass(frozen=True)
class BeatFolder:
    path: Path
    audio: Path
    image: Path

    @property
    def config_path(self) -> Path:
        return self.path / CONFIG_FILENAME

    @property
    def video_path(self) -> Path:
        return self.path / VIDEO_FILENAME


def find_beat_folder(path: Path) -> BeatFolder:
    """Validate ``path`` and locate its audio and image files.

    Raises ``BeatFolderError`` if the folder is missing or does not contain
    exactly one file of each kind.
    """
    if not path.exists():
        raise BeatFolderError(f"Folder does not exist: {path}")
    if not path.is_dir():
        raise BeatFolderError(f"Not a directory: {path}")

    return BeatFolder(
        path=path,
        audio=_single_file(path, AUDIO_EXTENSIONS, "audio"),
        image=_single_file(path, IMAGE_EXTENSIONS, "image"),
    )


def _single_file(folder: Path, extensions: frozenset[str], kind: str) -> Path:
    matches = sorted(f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in extensions)
    if not matches:
        raise BeatFolderError(f"No {kind} file found in {folder}")
    if len(matches) > 1:
        names = ", ".join(f.name for f in matches)
        raise BeatFolderError(f"More than one {kind} file found in {folder}: {names}")
    return matches[0]
