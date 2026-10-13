"""The Instagram Post: the service with a fake runner, caption assembly and the API.

No ``claude``: the runner is a fake, the same seam as Fill from title (ADR 0006).
"""

from datetime import datetime
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from beat_server.db.models import Beat, BeatStatus
from beat_server.db.repo import BeatRepo
from beat_server.services.errors import FillError
from beat_server.services.instagram import (
    INSTAGRAM_SCHEMA,
    MAX_CAPTION_LENGTH,
    InstagramService,
    assemble_caption,
)
from beat_upload.errors import ConfigError

TITLE = '[FREE] Travis Scott Type Beat 2026 - "Lasso" | Dark Trap'
GOOD: dict[str, Any] = {
    "hook": "this dark trap beat is crazy",
    "caption_body": '"Lasso" - dark trap type beat, 140 BPM, D minor\nHeavy 808s.\nlink in bio',
    "hashtags": ["#travisscotttypebeat", "darktrap", "prodbydelawer"],
    "audio_name": "Lasso (prod. delawer)",
    "alt_text": 'Cover art for "Lasso", a dark trap type beat by delawer',
}


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


def make_beat(session: Session, **overrides: Any) -> Beat:
    fields: dict[str, Any] = {
        "id": "b1",
        "status": BeatStatus.DRAFT,
        "title": TITLE,
        "description": "Heavy 808s and a cold melody.\nBPM: 140\n#travisscotttypebeat",
        "bpm": 140,
        "music_key": "Dmin",
        "name_moods": ["Dark"],
        "name_instruments": ["808"],
    }
    return BeatRepo(session).save(Beat(**(fields | overrides)))


def write(session: Session, runner: FakeRunner, beat: Beat | None = None) -> Beat:
    beat = beat or make_beat(session)
    InstagramService(runner).write(session, beat)
    return beat


# --- caption assembly (pure) ---------------------------------------------------------------


def test_the_caption_is_the_body_then_the_hashtags() -> None:
    assert assemble_caption("Line one\nline two", ["a", "b"]) == "Line one\nline two\n\n#a #b"


def test_a_caption_of_exactly_2200_characters_is_fine_and_one_more_is_not() -> None:
    tags = "#a"
    body = "x" * (MAX_CAPTION_LENGTH - len(tags) - 2)
    assert len(assemble_caption(body, ["a"])) == MAX_CAPTION_LENGTH
    with pytest.raises(ConfigError, match="2200"):
        assemble_caption(body + "x", ["a"])


# --- the service ---------------------------------------------------------------------------


def test_the_prompt_carries_title_facts_description_and_hashtags(session: Session) -> None:
    runner = FakeRunner(GOOD)
    write(session, runner)

    (prompt,) = runner.prompts
    assert TITLE in prompt
    assert "BPM 140, key D minor" in prompt
    assert "Dark" in prompt and "808" in prompt
    assert "Heavy 808s and a cold melody." in prompt
    assert "#travisscotttypebeat" in prompt
    assert "link in bio" in prompt and "60" in prompt and "prodbydelawer" in prompt
    assert runner.schemas == [INSTAGRAM_SCHEMA]


def test_a_valid_answer_is_saved_with_the_beat(session: Session) -> None:
    beat = write(session, FakeRunner(GOOD))

    session.expire_all()
    saved = BeatRepo(session).get(beat.id)
    assert saved is not None and saved.instagram_post is not None
    assert saved.instagram_post["hook"] == GOOD["hook"]
    assert saved.instagram_post["hashtags"] == ["travisscotttypebeat", "darktrap", "prodbydelawer"]


def test_writing_again_replaces_the_post(session: Session) -> None:
    beat = write(session, FakeRunner(GOOD))
    write(session, FakeRunner(GOOD | {"hook": "another hook"}), beat)

    session.expire_all()
    saved = BeatRepo(session).get(beat.id)
    assert saved is not None and saved.instagram_post is not None
    assert saved.instagram_post["hook"] == "another hook"


def test_a_title_with_a_placeholder_is_refused_before_the_model_runs(session: Session) -> None:
    runner = FakeRunner(GOOD)
    beat = make_beat(session, title='[FREE] [[Artist2]] Type Beat 2026 - "Lasso" | Trap')
    with pytest.raises(ConfigError, match=r"\[\[Artist2\]\]"):
        write(session, runner, beat)
    assert runner.prompts == []
    assert beat.instagram_post is None


def test_a_title_that_does_not_read_is_refused(session: Session) -> None:
    runner = FakeRunner(GOOD)
    with pytest.raises(ConfigError, match="Type Beat"):
        write(session, runner, make_beat(session, title="Just a name"))
    assert runner.prompts == []


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"hashtags": ["a", "b", "c", "d", "e", "f"]}, "6 hashtags"),
        ({"hashtags": ["a", "A"]}, "repeats"),
        ({"hashtags": ["two words"]}, "space"),
        ({"hook": "x" * 61}, "hook"),
        ({"hook": "ask @someone"}, "@"),
        ({"caption_body": "tag @travis"}, "@"),
        ({"hashtags": ["@travis"]}, "@"),
        ({"alt_text": "by @delawer"}, "@"),
        ({"audio_name": ""}, "audio_name"),
        ({"caption_body": "x" * 2300}, "2200"),
    ],
)
def test_a_bad_answer_is_a_fill_error_and_saves_nothing(
    session: Session, change: dict[str, Any], message: str
) -> None:
    beat = make_beat(session)
    with pytest.raises(FillError, match=message):
        write(session, FakeRunner(GOOD | change), beat)
    assert beat.instagram_post is None


def test_a_runner_failure_passes_through(session: Session) -> None:
    with pytest.raises(FillError, match="not logged in"):
        write(session, FakeRunner(FillError("`claude` is not logged in for this user.")))


# --- the API -------------------------------------------------------------------------------


@pytest.fixture
def fake(app: FastAPI) -> FakeRunner:
    runner = FakeRunner(GOOD)
    app.state.fill_runner = runner
    return runner


def test_get_does_not_write_the_post(
    client: TestClient, session: Session, fake: FakeRunner
) -> None:
    make_beat(session)
    body = client.get("/api/beats/b1/instagram").json()
    assert body["post"] is None
    assert body["posted"] is False
    assert fake.prompts == []


def test_post_writes_and_get_reads_back_the_same_text(
    client: TestClient, session: Session, fake: FakeRunner
) -> None:
    make_beat(session)

    written = client.post("/api/beats/b1/instagram")
    assert written.status_code == 200, written.text
    read = client.get("/api/beats/b1/instagram").json()

    assert read["post"] == written.json()["post"]
    assert read["post"]["hook"] == GOOD["hook"]
    assert read["post"]["caption"].endswith("\n\n#travisscotttypebeat #darktrap #prodbydelawer")
    assert read["post"]["audio_name"] == "Lasso (prod. delawer)"
    assert len(fake.prompts) == 1  # reading did not call the model again


def test_post_again_replaces_the_text(
    client: TestClient, session: Session, app: FastAPI, fake: FakeRunner
) -> None:
    make_beat(session)
    client.post("/api/beats/b1/instagram")
    app.state.fill_runner = FakeRunner(GOOD | {"hook": "second try"})

    again = client.post("/api/beats/b1/instagram").json()

    assert again["post"]["hook"] == "second try"
    assert client.get("/api/beats/b1/instagram").json()["post"]["hook"] == "second try"


def test_post_with_a_placeholder_title_is_422(
    client: TestClient, session: Session, fake: FakeRunner
) -> None:
    make_beat(session, title="x [[Artist2]]")
    response = client.post("/api/beats/b1/instagram")
    assert response.status_code == 422
    assert response.json()["detail"] == "Title still has [[Artist2]]; fix the title first."


def test_post_with_a_bad_answer_is_400(client: TestClient, session: Session, app: FastAPI) -> None:
    make_beat(session)
    app.state.fill_runner = FakeRunner(GOOD | {"hashtags": list("abcdef")})
    assert client.post("/api/beats/b1/instagram").status_code == 400


def test_posted_toggles_and_the_beat_carries_it(
    client: TestClient, session: Session, fake: FakeRunner
) -> None:
    make_beat(session)
    assert client.get("/api/beats/b1").json()["instagram_posted"] is False

    on = client.put("/api/beats/b1/instagram/posted", json={"posted": True})
    assert on.status_code == 200 and on.json()["posted"] is True
    assert client.get("/api/beats/b1").json()["instagram_posted"] is True
    assert [b["instagram_posted"] for b in client.get("/api/beats").json()] == [True]

    off = client.put("/api/beats/b1/instagram/posted", json={"posted": False})
    assert off.json()["posted"] is False
    assert client.put("/api/beats/nope/instagram/posted", json={"posted": True}).status_code == 404


def test_the_panel_carries_publish_time_and_beatstars_link(
    client: TestClient, session: Session, fake: FakeRunner
) -> None:
    make_beat(
        session,
        status=BeatStatus.SCHEDULED,
        publish_at=datetime(2026, 10, 15, 15, 0),
        beatstars_url="https://www.beatstars.com/TK1",
    )
    body = client.get("/api/beats/b1/instagram").json()
    assert body["publish_time"].startswith("2026-10-15T15:00")
    assert body["beatstars_url"] == "https://www.beatstars.com/TK1"


def test_publish_time_of_a_published_beat_is_when_it_went_out_and_empty_for_a_draft(
    client: TestClient, session: Session, fake: FakeRunner
) -> None:
    make_beat(session, id="pub", status=BeatStatus.PUBLISHED, published_at=datetime(2026, 9, 1, 8))
    make_beat(session, id="dr", youtube_id=None)
    assert client.get("/api/beats/pub/instagram").json()["publish_time"].startswith("2026-09-01")
    assert client.get("/api/beats/dr/instagram").json()["publish_time"] is None
