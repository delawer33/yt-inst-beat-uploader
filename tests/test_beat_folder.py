from pathlib import Path

import pytest

from beat_upload.beat_folder import find_beat_folder
from beat_upload.errors import BeatFolderError


def make_beat(tmp_path: Path, *names: str) -> Path:
    for name in names:
        (tmp_path / name).write_bytes(b"")
    return tmp_path


def test_finds_single_audio_and_image(tmp_path: Path) -> None:
    folder = make_beat(tmp_path, "beat.MP3", "cover.png", "config.yaml")
    beat = find_beat_folder(folder)
    assert beat.audio.name == "beat.MP3"
    assert beat.image.name == "cover.png"
    assert beat.config_path == folder / "config.yaml"
    assert beat.video_path == folder / "video.mp4"


def test_missing_folder(tmp_path: Path) -> None:
    with pytest.raises(BeatFolderError, match="does not exist"):
        find_beat_folder(tmp_path / "nope")


def test_path_is_a_file(tmp_path: Path) -> None:
    f = tmp_path / "file.txt"
    f.write_text("")
    with pytest.raises(BeatFolderError, match="Not a directory"):
        find_beat_folder(f)


@pytest.mark.parametrize(
    ("names", "message"),
    [
        (("cover.png",), "No audio file"),
        (("beat.mp3",), "No image file"),
        (("a.mp3", "b.wav", "cover.png"), "More than one audio"),
        (("beat.mp3", "a.png", "b.jpg"), "More than one image"),
    ],
)
def test_wrong_file_count(tmp_path: Path, names: tuple[str, ...], message: str) -> None:
    with pytest.raises(BeatFolderError, match=message):
        find_beat_folder(make_beat(tmp_path, *names))
