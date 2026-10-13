"""The Instagram panel over HTTP: the state of the Beat's Reel and "Show in folder".

``GET`` is what opens the panel, so it also queues the REEL job when the Beat has no current
Reel (a Beat made before Reels, or one whose style changed). The Instagram Post itself is
added by later tickets.
"""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from beat_server.api.beats import QueueDep, SessionDep, WorkspaceDep, load_beat
from beat_server.db.models import Beat
from beat_server.db.repo import BeatRepo, JobRepo
from beat_server.services.instagram import (
    InstagramPost,
    InstagramService,
    instagram_publish_time,
)
from beat_server.services.reel import Opener, ReelState, ensure_reel, reel_state, show_reel

router = APIRouter(prefix="/api/beats", tags=["instagram"])


def get_opener(request: Request) -> Opener:
    return request.app.state.opener


OpenerDep = Annotated[Opener, Depends(get_opener)]


def get_instagram_service(request: Request) -> InstagramService:
    return InstagramService(request.app.state.fill_runner)


InstagramServiceDep = Annotated[InstagramService, Depends(get_instagram_service)]


class ReelOut(BaseModel):
    """The Reel of a Beat. ``rendering`` carries the REEL job's progress; ``failed`` its error;
    ``unavailable`` means the Beat has no audio and cover on disk."""

    state: Literal["ready", "rendering", "failed", "unavailable"]
    progress: float | None
    message: str | None
    error: str | None


class InstagramPostOut(BaseModel):
    """The Instagram Post, in the order Instagram asks for it. ``caption`` is assembled."""

    hook: str
    caption: str
    hashtags: list[str]
    audio_name: str
    alt_text: str

    @classmethod
    def from_post(cls, post: InstagramPost) -> "InstagramPostOut":
        return cls(
            hook=post.hook,
            caption=post.caption(),
            hashtags=post.hashtags,
            audio_name=post.audio_name,
            alt_text=post.alt_text,
        )


class PostedIn(BaseModel):
    posted: bool


class InstagramOut(BaseModel):
    reel: ReelOut
    # ``None`` until the owner asks for it (POST).
    post: InstagramPostOut | None
    # When the beat goes public on YouTube (UTC, like every server time); ``None`` for a
    # Draft with no schedule.
    publish_time: datetime | None
    beatstars_url: str | None
    posted: bool


def _out(session: Session, ws: WorkspaceDep, queue: QueueDep, beat_id: str) -> InstagramOut:
    beat = load_beat(session, beat_id)
    state = ensure_reel(ws, JobRepo(session), queue, beat)
    return _build(beat, state)


def _build(beat: Beat, state: ReelState) -> InstagramOut:
    job = state.job
    return InstagramOut(
        reel=ReelOut(
            state=state.state,
            progress=job.progress if job and state.state == "rendering" else None,
            message=job.message if job and state.state == "rendering" else None,
            error=job.error if job and state.state == "failed" else None,
        ),
        post=(
            InstagramPostOut.from_post(InstagramPost.from_json(beat.instagram_post))
            if beat.instagram_post
            else None
        ),
        publish_time=instagram_publish_time(beat),
        beatstars_url=beat.beatstars_url,
        posted=beat.instagram_posted,
    )


@router.get("/{beat_id}/instagram", response_model=InstagramOut)
def get_instagram(
    beat_id: str, session: SessionDep, ws: WorkspaceDep, queue: QueueDep
) -> InstagramOut:
    return _out(session, ws, queue, beat_id)


@router.post("/{beat_id}/reel/show", status_code=204)
def show_reel_in_folder(
    beat_id: str, session: SessionDep, ws: WorkspaceDep, opener: OpenerDep
) -> Response:
    """Open the file manager with ``reel.mp4`` selected. No Reel on disk yet -> 409."""
    show_reel(ws, load_beat(session, beat_id), opener)
    return Response(status_code=204)


@router.post("/{beat_id}/instagram", response_model=InstagramOut)
def write_instagram(
    beat_id: str,
    session: SessionDep,
    ws: WorkspaceDep,
    queue: QueueDep,
    service: InstagramServiceDep,
) -> InstagramOut:
    """Write the Instagram Post, or write it again (the old one is replaced)."""
    beat = load_beat(session, beat_id)
    service.write(session, beat)
    return _build(beat, ensure_reel(ws, JobRepo(session), queue, beat))


@router.put("/{beat_id}/instagram/posted", response_model=InstagramOut)
def set_posted(beat_id: str, body: PostedIn, session: SessionDep, ws: WorkspaceDep) -> InstagramOut:
    """The "Posted on Instagram" switch: the owner posts by hand and records it here."""
    beat = load_beat(session, beat_id)
    beat.instagram_posted = body.posted
    BeatRepo(session).save(beat)
    return _build(beat, reel_state(ws, JobRepo(session), beat))
