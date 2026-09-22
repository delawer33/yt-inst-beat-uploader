"""The Library over HTTP: list, one beat, its cover, its privacy.

Slice 5 adds create (multipart), PATCH, upload and delete to this router.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from beat_server.api.schemas import BeatOut, PrivacyIn
from beat_server.db.models import Beat
from beat_server.db.repo import BeatRepo
from beat_server.deps import get_session, get_workspace
from beat_server.jobs.events import EventBus
from beat_server.services.errors import BeatNotFound, BeatStateError
from beat_server.services.sync import status_from_privacy
from beat_upload.auth import get_valid_credentials
from beat_upload.workspace import Workspace
from beat_upload.youtube import set_privacy

router = APIRouter(prefix="/api/beats", tags=["beats"])

SessionDep = Annotated[Session, Depends(get_session)]
WorkspaceDep = Annotated[Workspace, Depends(get_workspace)]


def get_bus(request: Request) -> EventBus:
    return request.app.state.bus


BusDep = Annotated[EventBus, Depends(get_bus)]


def load_beat(session: Session, beat_id: str) -> Beat:
    beat = BeatRepo(session).get(beat_id)
    if beat is None:
        raise BeatNotFound(f"Beat {beat_id} does not exist.")
    return beat


@router.get("", response_model=list[BeatOut])
def list_beats(session: SessionDep) -> list[BeatOut]:
    return [BeatOut.from_beat(beat) for beat in BeatRepo(session).list()]


@router.get("/{beat_id}", response_model=BeatOut)
def get_beat(beat_id: str, session: SessionDep) -> BeatOut:
    return BeatOut.from_beat(load_beat(session, beat_id))


@router.get("/{beat_id}/cover", response_class=FileResponse)
def get_cover(beat_id: str, session: SessionDep, ws: WorkspaceDep) -> FileResponse:
    """The local cover image; 404 when the beat only exists on YouTube."""
    beat = load_beat(session, beat_id)
    path = ws.beat_dir(beat.id) / beat.image_path if beat.image_path else None
    if path is None or not path.is_file():
        raise BeatNotFound(f"Beat {beat_id} has no local cover.")
    return FileResponse(path)


@router.post("/{beat_id}/privacy", response_model=BeatOut)
def change_privacy(
    beat_id: str, body: PrivacyIn, session: SessionDep, ws: WorkspaceDep, bus: BusDep
) -> BeatOut:
    """Change the privacy of an uploaded beat on YouTube, then mirror it locally."""
    beat = load_beat(session, beat_id)
    if not beat.youtube_id:
        raise BeatStateError(f"Beat {beat_id} is not on YouTube yet; upload it first.")
    set_privacy(beat.youtube_id, body.privacy, get_valid_credentials(ws))  # AuthError -> 409
    beat.privacy = body.privacy.value
    beat.status = status_from_privacy(beat.privacy)
    BeatRepo(session).save(beat)
    bus.publish_beat(beat.id, beat.status)
    return BeatOut.from_beat(beat)
