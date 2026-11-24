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


def test_bare_bpm_and_a_stray_dash() -> None:
    assert parse_bounce_name("125_Bmin_-inspiring-dreamy_synth-guitar_smp_cymatics") == BounceFacts(
        bpm=125,
        key="Bmin",
        moods=("inspiring", "dreamy"),
        instruments=("synth", "guitar"),
        samples=True,
        sample_source="Cymatics",
    )
    assert parse_bounce_name("16.19_26") is None


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
        (("a.wav", "a.mp3"), "cover image or clip"),
        (("a.wav", "a.mp3", "c.png", "c.mp4"), "More than one cover image or clip"),
        (("a.wav", "a.mp3", "c.mov", "d.mp4"), "More than one cover image or clip"),
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


def test_a_dash_instead_of_the_underscore_after_the_key() -> None:
    name = "156_Amin-atmospheric-dreamy-calm_piano-reesebass-reverb_smp_youtube"
    assert parse_bounce_name(name) == BounceFacts(
        bpm=156,
        key="Amin",
        moods=("atmospheric", "dreamy", "calm"),
        instruments=("piano", "reesebass", "reverb"),
        samples=True,
        sample_source="Youtube",
    )


def test_a_clip_stands_in_for_the_cover_image(tmp_path: Path) -> None:
    found = read_bounce_folder(make(tmp_path, "104bpm_Amin", ("a.wav", "a.mp3", "c.MOV")))
    assert found.cover is None and found.clip == found.folder / "c.MOV"
    with_image = read_bounce_folder(make(tmp_path, "105bpm_Amin"))
    assert with_image.clip is None and with_image.cover == with_image.folder / "c.png"


def test_a_key_without_min_or_maj_counts_as_minor() -> None:
    facts = parse_bounce_name("90_D#_sad-calm-melancholic_guitar-bass_smp-splice")
    assert facts is not None
    assert (facts.bpm, facts.key, facts.moods) == (90, "D#min", ("sad", "calm", "melancholic"))
    assert parse_bounce_name("160_A#maj_happy").key == "A#maj"  # type: ignore[union-attr]
