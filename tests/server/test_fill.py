"""Fill from title: the service with a fake runner standing in for the ``claude`` CLI."""

from typing import Any

import pytest

from beat_server.db.models import Beat, BeatStatus
from beat_server.services.errors import BeatStateError, FillError
from beat_server.services.fill import FILL_SCHEMA, Filled, FillService
from beat_upload.errors import ConfigError

TEMPLATES = {
    "title_template": '[FREE] [[Artist1]] Type Beat x [[Artist2]] Type Beat - "{name}"',
    "description_template": "BPM: [[140]] | Key: [[F minor]]\n#[[artist1]]typebeat",
    "tags_template": ["[[artist1]] type beat", "free type beat"],
}
TITLE = '[FREE] Travis Scott Type Beat 2026 - "Lasso" | Dark Trap'


class FakeRunner:
    def __init__(self, answer: dict[str, Any] | Exception) -> None:
        self.answer = answer
        self.prompts: list[str] = []
        self.schemas: list[dict[str, Any]] = []

    def __call__(self, prompt: str, schema: dict[str, Any]) -> dict[str, Any]:
        self.prompts.append(prompt)
        self.schemas.append(schema)
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer


def draft(**overrides: Any) -> Beat:
    fields: dict[str, Any] = {
        "id": "b1",
        "status": BeatStatus.DRAFT,
        "title": TITLE,
        "description": "BPM: 112 | Key: [[F minor]]\n#[[artist1]]typebeat",
        "tags": ["[[artist1]] type beat"],
        "source_name": "Dmin110.mp3",
    }
    return Beat(**(fields | overrides))


def fill(runner: FakeRunner, beat: Beat | None = None, **form: Any) -> Filled:
    beat = beat or draft()
    return FillService(runner).fill(
        beat,
        title=form.get("title", beat.title),
        description=form.get("description", beat.description),
        tags=form.get("tags", beat.tags),
        templates=TEMPLATES,
    )


GOOD = {
    "description": "BPM: 112 | Key: D minor\n#travisscotttypebeat",
    "tags": [" travis scott type beat ", "free type beat", "", "dark trap type beat"],
}


def test_the_prompt_carries_title_templates_current_text_and_file_facts() -> None:
    runner = FakeRunner(GOOD)
    fill(runner, description="BPM: 112 (mine)", tags=["my own tag"])

    (prompt,) = runner.prompts
    assert TITLE in prompt
    assert TEMPLATES["description_template"] in prompt
    assert "[[artist1]] type beat" in prompt
    assert "BPM: 112 (mine)" in prompt and "my own tag" in prompt
    assert "Dmin110.mp3" in prompt
    assert "110" in prompt and "D minor" in prompt
    assert runner.schemas == [FILL_SCHEMA]


def test_without_a_file_name_bpm_and_key_are_left_to_the_owner() -> None:
    runner = FakeRunner(GOOD)
    fill(runner, draft(source_name=None))
    assert "D minor" not in runner.prompts[0]
    assert "not known" in runner.prompts[0]


def test_a_valid_answer_comes_back_as_description_and_tags() -> None:
    assert fill(FakeRunner(GOOD)) == Filled(
        description=GOOD["description"],
        tags=["travis scott type beat", "free type beat", "dark trap type beat"],
    )


def test_tags_over_youtubes_limit_are_rejected_with_the_validators_message() -> None:
    answer = {"description": "ok", "tags": ["x" * 300, "y" * 300]}
    with pytest.raises(FillError, match="500 characters"):
        fill(FakeRunner(answer))


def test_angle_brackets_are_rejected_with_the_validators_message() -> None:
    answer = {"description": "<b>loud</b>", "tags": []}
    with pytest.raises(FillError, match="< or >"):
        fill(FakeRunner(answer))


def test_an_answer_of_the_wrong_shape_is_a_fill_error() -> None:
    with pytest.raises(FillError, match="did not come back"):
        fill(FakeRunner({"description": "only this"}))


def test_a_runner_error_surfaces_as_is() -> None:
    error = FillError("The `claude` command is not logged in.")
    with pytest.raises(FillError, match="not logged in"):
        fill(FakeRunner(error))


def test_a_title_with_a_placeholder_is_refused_before_the_model_runs() -> None:
    runner = FakeRunner(GOOD)
    with pytest.raises(ConfigError, match=r"Title still has \[\[Artist2\]\]"):
        fill(runner, title="Travis Scott Type Beat x [[Artist2]] Type Beat")
    assert runner.prompts == []


def test_only_a_draft_is_filled() -> None:
    runner = FakeRunner(GOOD)
    with pytest.raises(BeatStateError):
        fill(runner, draft(status=BeatStatus.QUEUED))
    assert runner.prompts == []
