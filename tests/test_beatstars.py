import pytest

from beat_upload.beatstars.naming import (
    TrackFileKind,
    TrackFileName,
    beatstars_key,
    file_safe_name,
    normalize_key,
    parse_track_filename,
)
from beat_upload.beatstars.package import cut_points, find_package, leading_silence
from beat_upload.beatstars.track import (
    BeatStarsTrack,
    moods_for_genre,
    read_track,
    track_from_youtube,
    write_track,
)
from beat_upload.errors import BeatStarsError


@pytest.mark.parametrize(
    ("filename", "facts", "kind"),
    [
        (
            "Diavolo_95bpm_Cmin_dark-intense_delawer.wav",
            TrackFileName("Diavolo", 95, "Cmin", ("dark", "intense")),
            TrackFileKind.MASTER,
        ),
        (
            "Diavolo_95bpm_Cmin_dark-intense_delawer_tagged.mp3",
            TrackFileName("Diavolo", 95, "Cmin", ("dark", "intense")),
            TrackFileKind.PREVIEW,
        ),
        (
            "A-Hot-One_80bpm_D#min_smp_delawer.wav",
            TrackFileName("A-Hot-One", 80, "D#min", samples=True),
            TrackFileKind.MASTER,
        ),
        (
            "Lasso_110bpm_Bbmaj_delawer_stems.zip",
            TrackFileName("Lasso", 110, "Bbmaj"),
            TrackFileKind.STEMS,
        ),
    ],
)
def test_a_file_name_carries_bpm_key_moods_and_samples(
    filename: str, facts: TrackFileName, kind: TrackFileKind
) -> None:
    assert parse_track_filename(filename) == (facts, kind)
    if kind is not TrackFileKind.STEMS or filename.endswith(".zip"):
        assert facts.filename(kind) == filename


@pytest.mark.parametrize(
    "filename",
    [
        "Diavolo.wav",
        "Diavolo_95_Cmin_delawer.wav",
        "Diavolo_95bpm_Cm_delawer.wav",
        "Diavolo_95bpm_Cmin_Dark_delawer.wav",
        "Diavolo_95bpm_Cmin_dark_intense_delawer.wav",
        "Diavolo_95bpm_Cmin_a-b-c-d-e-f_delawer.wav",
        "Diavolo_95bpm_Cmin_someone.wav",
    ],
)
def test_a_name_off_the_scheme_says_what_is_wrong(filename: str) -> None:
    with pytest.raises(BeatStarsError, match="Diavolo"):
        parse_track_filename(filename)


def test_keys_are_read_from_descriptions_and_written_for_the_studio_select() -> None:
    assert normalize_key("F# minor") == "F#min"
    assert normalize_key("A#min") == "A#min"
    assert normalize_key("D minor") == "Dmin"
    assert normalize_key("no key") is None
    assert beatstars_key("F#min") == "F_SHARP_MINOR"
    assert beatstars_key("Bbmaj") == "B_FLAT_MAJOR"
    assert beatstars_key("Cmin") == "C_MINOR"
    assert file_safe_name("They Come And Go") == "They-Come-And-Go"


def test_two_artists_make_title_tags_and_description() -> None:
    title = '[FREE] Hoodtrap Type Beat x Jerk Type Beat 2026 - "Diavolo" | Hard Rap Beat'
    track = track_from_youtube(title, 95, "Cmin", "-3aBT57ZdEo")
    assert track.title == "Diavolo | Hoodtrap x Jerk Type Beat"
    assert track.tags == ["hoodtrap type beat", "jerk type beat", "hard rap beat"]
    assert track.genres == ["Trap", "Hip Hop"]
    assert track.moods == ["Energetic", "Intense", "Angry"]
    assert track.description.splitlines() == [
        title,
        "BPM: 95 | Key: C minor",
        'Free for non-profit with credit "prod. delawer". License for release above.',
        "https://youtu.be/-3aBT57ZdEo",
    ]


def test_one_artist_adds_the_producer_tag_and_genre_adds_a_beatstars_genre() -> None:
    track = track_from_youtube(
        '[FREE] King Von Type Beat 2026 - "Actor" | Chicago Drill x Hard Trap', 140, "Gmin"
    )
    assert track.title == "Actor | King Von Type Beat"
    assert track.tags == ["king von type beat", "chicago drill", "delawer type beat"]
    assert track.genres == ["Trap", "Hip Hop", "Drill"]
    assert "youtu.be" not in track.description


def test_a_title_over_60_keeps_one_artist() -> None:
    track = track_from_youtube(
        '[FREE] Weeknd Type Beat x PARTYNEXTDOOR Type Beat 2026 - "A Very Long Beat Name Here" '
        "| RNB Type Beat",
        104,
        "Fmin",
    )
    assert track.title == "A Very Long Beat Name Here | Weeknd Type Beat"
    assert track.genres == ["Trap", "Hip Hop", "R&B"]


def test_moods_follow_the_first_matching_genre_word() -> None:
    assert moods_for_genre("Melodic Guitar Trap") == ["Sad", "Melancholy", "Dreamy"]
    assert moods_for_genre("Trap") == ["Energetic", "Confident", "Bold"]


def test_track_limits_are_checked() -> None:
    with pytest.raises(BeatStarsError, match="60"):
        BeatStarsTrack(title="x" * 61, bpm=95, key="Cmin")
    with pytest.raises(BeatStarsError, match="tags"):
        BeatStarsTrack(title="x", bpm=95, key="Cmin", tags=["a b", "c d", "e f", "g h"])
    with pytest.raises(BeatStarsError, match="25"):
        BeatStarsTrack(title="x", bpm=95, key="Cmin", tags=["x" * 26])


def test_track_json_round_trips(tmp_path) -> None:
    track = BeatStarsTrack(title="Diavolo", bpm=95, key="Cmin", tags=["jerk type beat"])
    write_track(track, tmp_path)
    assert read_track(tmp_path) == track


def test_leading_silence_is_read_only_from_the_very_start() -> None:
    log = "[silencedetect] silence_start: 0\n[silencedetect] silence_end: 5.771701 | d"
    assert leading_silence(log) == pytest.approx(5.771701)
    assert leading_silence("[silencedetect] silence_start: 8.48\nsilence_end: 8.54") == 0
    assert leading_silence("") == 0


def test_the_tagged_bounce_is_cut_at_the_same_bar_counted_from_its_end() -> None:
    assert cut_points(0.647, 152.571, 157.714) == pytest.approx((0.632, 5.775))
    assert cut_points(0.0, 160.0, 160.0) == (0.0, 0.0)
    with pytest.raises(BeatStarsError, match="shorter"):
        cut_points(0.0, 160.0, 150.0)


def test_find_package_wants_one_master_one_preview_and_a_cover(tmp_path) -> None:
    facts = TrackFileName("Diavolo", 95, "Cmin")
    write_track(BeatStarsTrack(title="Diavolo", bpm=95, key="Cmin"), tmp_path)
    (tmp_path / facts.filename(TrackFileKind.MASTER)).write_bytes(b"")
    with pytest.raises(BeatStarsError, match="_tagged.mp3"):
        find_package(tmp_path)
    (tmp_path / facts.filename(TrackFileKind.PREVIEW)).write_bytes(b"")
    (tmp_path / "cover.jpg").write_bytes(b"")
    package = find_package(tmp_path)
    assert package.master.name == "Diavolo_95bpm_Cmin_delawer.wav"
    assert package.preview.name == "Diavolo_95bpm_Cmin_delawer_tagged.mp3"
    assert package.stems is None


# --- catalog, instruments, release date, resumable drafts, stems zip -------------------------


def test_the_catalog_lists_are_unique_and_spelled_as_studio_spells_them() -> None:
    from beat_upload.beatstars import catalog

    for values in (catalog.MOODS, catalog.INSTRUMENTS, catalog.GENRES):
        assert len(values) == len(set(values))
    assert "Dark" in catalog.MOODS and "Melancholy" in catalog.MOODS
    assert "Electric guitar" in catalog.INSTRUMENTS  # capital E, lower g, as Studio has it
    assert "Rage / Rage Beats" in catalog.GENRES
    # every mood the genre guesses can pick is in Studio's list
    from beat_upload.beatstars.track import _GENRE_MOODS, DEFAULT_MOODS

    guessed = {m for _, moods in _GENRE_MOODS for m in moods} | set(DEFAULT_MOODS)
    assert guessed <= set(catalog.MOODS)


def test_instruments_are_limited_to_ten_from_the_catalog() -> None:
    BeatStarsTrack(title="T", bpm=95, key="Cmin", instruments=["Guitar", "Bass"])
    with pytest.raises(BeatStarsError, match="instrument list"):
        BeatStarsTrack(title="T", bpm=95, key="Cmin", instruments=["808"])
    with pytest.raises(BeatStarsError, match="at most 10"):
        BeatStarsTrack(title="T", bpm=95, key="Cmin", instruments=["Guitar"] * 11)


def test_a_beats_track_has_instruments_and_no_youtube_link() -> None:
    from beat_upload.beatstars.track import track_for_beat

    track = track_for_beat(
        '[FREE] Yeat Type Beat 2026 - "Naughty" | Hard Trap', 95, "Cmin", ["Dark"], ["Guitar"]
    )
    assert track.instruments == ["Guitar"] and track.moods == ["Dark"]
    assert track.title == "Naughty | Yeat Type Beat"
    assert "youtu" not in track.description and track.youtube_id is None
    assert read_track_roundtrip(track).instruments == ["Guitar"]


def read_track_roundtrip(track: BeatStarsTrack) -> BeatStarsTrack:
    return BeatStarsTrack.from_dict(track.to_dict())


def test_stems_are_zipped_flat_and_stored(tmp_path) -> None:
    import zipfile

    from beat_upload.beatstars.package import zip_stems

    stems = tmp_path / "stems"
    (stems / "sub").mkdir(parents=True)
    (stems / "kick.wav").write_bytes(b"k" * 5000)
    (stems / "sub" / "bass.wav").write_bytes(b"b" * 5000)
    target = zip_stems(stems, tmp_path / "stems.zip")
    with zipfile.ZipFile(target) as archive:
        assert sorted(archive.namelist()) == ["bass.wav", "kick.wav"]
        assert {i.compress_type for i in archive.infolist()} == {zipfile.ZIP_STORED}
        assert archive.read("kick.wav") == b"k" * 5000


def test_stems_with_a_doubled_name_or_none_are_refused(tmp_path) -> None:
    from beat_upload.beatstars.package import zip_stems

    stems = tmp_path / "stems"
    (stems / "a").mkdir(parents=True)
    with pytest.raises(BeatStarsError, match="No files"):
        zip_stems(stems, tmp_path / "s.zip")
    (stems / "a" / "x.wav").write_bytes(b"1")
    (stems / "x.wav").write_bytes(b"2")
    with pytest.raises(BeatStarsError, match="x.wav"):
        zip_stems(stems, tmp_path / "s.zip")


def test_sources_from_a_bounce_folder_zip_the_stems_and_use_the_rest_in_place(tmp_path) -> None:
    from beat_upload.beatstars.package import sources_from_bounce

    (tmp_path / "stems").mkdir()
    (tmp_path / "stems" / "kick.wav").write_bytes(b"k")
    master, tagged, cover = (tmp_path / n for n in ("m.wav", "t.mp3", "c.png"))
    work = tmp_path / "work"
    sources = sources_from_bounce(master, tagged, cover, tmp_path / "stems", work)
    assert (sources.master, sources.tagged, sources.cover) == (master, tagged, cover)
    assert sources.stems is not None and sources.stems.parent == work and sources.stems.is_file()
    assert sources_from_bounce(master, tagged, cover, None, work).stems is None


def test_the_release_date_field_label_is_spelled_like_studio() -> None:
    from datetime import datetime

    from beat_upload.beatstars.studio import _release_label

    assert _release_label(datetime(2026, 10, 11, 13, 30)) == "October 11, 2026 at 1:30 PM"
    assert _release_label(datetime(2026, 1, 2, 0, 5)) == "January 2, 2026 at 12:05 AM"
    assert _release_label(datetime(2026, 1, 2, 12, 0)) == "January 2, 2026 at 12:00 PM"


def test_a_failure_after_the_track_exists_names_its_id_and_the_id_was_reported(
    monkeypatch, tmp_path
) -> None:
    from beat_upload.beatstars import studio
    from beat_upload.beatstars.package import TrackPackage

    track = BeatStarsTrack(title="T", bpm=95, key="Cmin")
    package = TrackPackage(
        tmp_path, tmp_path / "m.wav", tmp_path / "p.mp3", tmp_path / "c.jpg", track
    )

    def broken_fill(*args) -> None:
        raise BeatStarsError("the cover did not take")

    def create(page, master, on_created) -> str:
        on_created("TK1")
        return "TK1"

    monkeypatch.setattr(studio, "_create_track", create)
    monkeypatch.setattr(studio, "_fill_and_publish", broken_fill)
    created: list[str] = []
    with pytest.raises(BeatStarsError, match=r"TK1.*--draft TK1"):
        studio.publish_package(None, package, lambda _: None, on_created=created.append)
    assert created == ["TK1"]


def test_a_draft_is_reopened_and_reported_again(monkeypatch, tmp_path) -> None:
    from beat_upload.beatstars import studio
    from beat_upload.beatstars.package import TrackPackage

    class Page:
        def __init__(self) -> None:
            self.visited: list[str] = []

        def goto(self, url: str) -> None:
            self.visited.append(url)

        def wait_for_selector(self, selector: str) -> None:
            pass

    track = BeatStarsTrack(title="T", bpm=95, key="Cmin")
    package = TrackPackage(
        tmp_path, tmp_path / "m.wav", tmp_path / "p.mp3", tmp_path / "c.jpg", track
    )
    release = []
    monkeypatch.setattr(studio, "_fill_and_publish", lambda *a: release.append(a[-1]))
    page, created = Page(), []
    from datetime import UTC, datetime

    at = datetime(2030, 1, 1, tzinfo=UTC)
    studio.publish_package(
        page, package, lambda _: None, draft="TK9", release_at=at, on_created=created.append
    )
    assert page.visited == [studio.edit_url("TK9")] and created == ["TK9"] and release == [at]
