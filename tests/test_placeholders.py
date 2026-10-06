import pytest

from beat_upload.placeholders import fields_with_placeholder, placeholders_in


def test_names_every_placeholder_in_order() -> None:
    assert placeholders_in("[[Artist1]] x [[Artist2]] - [[140]] bpm") == [
        "[[Artist1]]",
        "[[Artist2]]",
        "[[140]]",
    ]


def test_an_unclosed_marker_still_counts() -> None:
    assert placeholders_in("Nardo Wick x [[Artist2") == ["[[Artist2"]


def test_plain_text_has_none() -> None:
    assert placeholders_in("Nardo Wick Type Beat [Hard]") == []


@pytest.mark.parametrize(
    ("title", "description", "tags", "expected"),
    [
        ("Clean", "Clean", ["clean"], []),
        ("[[Artist1]] Type Beat", "", [], ["title"]),
        ("Clean", "bpm [[140]]", [], ["description"]),
        ("Clean", "", ["ok", "[[Artist1]] type beat"], ["tags"]),
        ("[[a]]", "[[b]]", ["[[c]]"], ["title", "description", "tags"]),
    ],
)
def test_fields_with_placeholder(
    title: str, description: str, tags: list[str], expected: list[str]
) -> None:
    assert fields_with_placeholder(title, description, tags) == expected
