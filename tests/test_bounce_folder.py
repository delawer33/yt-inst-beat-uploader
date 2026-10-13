from pathlib import Path

import pytest

from beat_upload.bounce_folder import BounceFacts, parse_bounce_name, read_bounce_folder
from beat_upload.errors import BounceFolderError


def make(root: Path, name: str, files: tuple[str, ...] = ("a.wav", "a.mp3", "c.png")) -> Path:
    folder = root / name
    folder.mkdir()
    for f in files:
        (folder / f).write_bytes(b"x")
    return folder


def test_moods_only() -> None:
    assert parse_bounce_name("Jungle_104bpm_Amin_calm-rhytmic-mysterious") == BounceFacts(
        bpm=104, key="Amin", moods=("calm", "rhytmic", "mysterious")
    )


def test_instruments_and_samples() -> None:
    assert parse_bounce_name("104bpm_Amin_calm_guitar-808_smp") == BounceFacts(
        bpm=104,
        key="Amin",
        moods=("calm",),
        instruments=("guitar", "808"),
        samples=True,
        sample_source="Splice",
    )


def test_where_the_samples_come_from() -> None:
    for name in (
        "140bpm_Cmin_dreamy_synth_smp-looperman",
        "140bpm_Cmin_dreamy_synth_smp_looperman",
    ):
        facts = parse_bounce_name(name)
        assert facts is not None
        assert facts.sample_source == "Looperman" and facts.instruments == ("synth",)
    no_samples = parse_bounce_name("140bpm_Cmin_dreamy")
    assert no_samples is not None and no_samples.sample_source is None


def test_bpm_and_key_only() -> None:
    assert parse_bounce_name("104bpm_Amin") == BounceFacts(bpm=104, key="Amin")


def test_no_facts() -> None:
    assert parse_bounce_name("Jungle") is None
    assert parse_bounce_name("104bpm_nokey") is None


def test_facts_from_folder_name_and_files_by_kind(tmp_path: Path) -> None:
    folder = make(tmp_path, "Jungle_104bpm_Amin_calm")
    (folder / "stems").mkdir()
    found = read_bounce_folder(folder)
    assert found.master.name == "a.wav" and found.tagged.name == "a.mp3"
    assert found.cover.name == "c.png" and found.stems == folder / "stems"
    assert found.facts.moods == ("calm",)


def test_facts_from_the_wav_when_the_folder_has_none(tmp_path: Path) -> None:
    folder = make(tmp_path, "Jungle", ("104bpm_Amin_dark.wav", "t.mp3", "c.jpg"))
    found = read_bounce_folder(folder)
    assert found.facts == BounceFacts(bpm=104, key="Amin", moods=("dark",))
    assert found.stems is None


@pytest.mark.parametrize(
    ("files", "kind"),
    [
        (("a.mp3", "c.png"), "WAV"),
        (("a.wav", "a.mp3", "b.mp3", "c.png"), "MP3"),
        (("a.wav", "a.mp3"), "cover image"),
    ],
)
def test_folder_problems_name_the_file_kind(
    tmp_path: Path, files: tuple[str, ...], kind: str
) -> None:
    folder = make(tmp_path, "104bpm_Amin", files)
    with pytest.raises(BounceFolderError, match=kind):
        read_bounce_folder(folder)


def test_no_bpm_or_key_anywhere(tmp_path: Path) -> None:
    with pytest.raises(BounceFolderError, match="BPM and key"):
        read_bounce_folder(make(tmp_path, "Jungle"))


def test_missing_folder(tmp_path: Path) -> None:
    with pytest.raises(BounceFolderError, match="does not exist"):
        read_bounce_folder(tmp_path / "nope")
