import pytest

from beat_upload.audio_name import AudioNameFacts, audio_name_facts


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Dmin110", AudioNameFacts(key="Dmin", bpm=110)),
        ("Dmin110.mp3", AudioNameFacts(key="Dmin", bpm=110)),
        ("C#min123.wav", AudioNameFacts(key="C#min", bpm=123)),
        ("Fmaj90", AudioNameFacts(key="Fmaj", bpm=90)),
        ("Bbmaj140", AudioNameFacts(key="Bbmaj", bpm=140)),
        ("Lasso", None),
        ("Lasso.mp3", None),
        ("110", None),
        ("Dm110", None),
        ("Hmin110", None),
        ("Dmin110 final", None),
        ("dmin110", None),
        ("", None),
    ],
)
def test_audio_name_facts(name: str, expected: AudioNameFacts | None) -> None:
    assert audio_name_facts(name) == expected


def test_the_key_is_spelled_out_the_way_a_description_says_it() -> None:
    assert AudioNameFacts(key="Dmin", bpm=110).spelled_key == "D minor"
    assert AudioNameFacts(key="C#maj", bpm=90).spelled_key == "C# major"
