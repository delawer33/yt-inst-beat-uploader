"""The Instagram panel over HTTP: the state of the Beat's Reel and "Show in folder".

``GET`` is what opens the panel, so it also queues the REEL job when the Beat has no current
Reel (a Beat made before Reels, or one whose style changed). The Instagram Post itself is
added by later tickets.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from beat_server.api.beats import QueueDep, SessionDep, WorkspaceDep, load_beat
from beat_server.db.repo import JobRepo
from beat_server.services.reel import Opener, ensure_reel, show_reel

router = APIRouter(prefix="/api/beats", tags=["instagram"])


def get_opener(request: Request) -> Opener:
    return request.app.state.opener


OpenerDep = Annotated[Opener, Depends(get_opener)]


class ReelOut(BaseModel):
    """The Reel of a Beat. ``rendering`` carries the REEL job's progress; ``failed`` its error;
    ``unavailable`` means the Beat has no audio and cover on disk."""

    state: Literal["ready", "rendering", "failed", "unavailable"]
    progress: float | None
    message: str | None
    error: str | None


class InstagramOut(BaseModel):
    reel: ReelOut


def _out(session: Session, ws: WorkspaceDep, queue: QueueDep, beat_id: str) -> InstagramOut:
    beat = load_beat(session, beat_id)
    state = ensure_reel(ws, JobRepo(session), queue, beat)
    job = state.job
    return InstagramOut(
        reel=ReelOut(
            state=state.state,
            progress=job.progress if job and state.state == "rendering" else None,
            message=job.message if job and state.state == "rendering" else None,
            error=job.error if job and state.state == "failed" else None,
        )
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
