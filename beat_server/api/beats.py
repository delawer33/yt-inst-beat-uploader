"""The Library over HTTP: list, one beat, its cover, its privacy; create, edit, upload
and delete a draft.

Multipart ``POST /api/beats`` stores the files and applies the owner's templates; the beat
then stays a DRAFT until ``POST /api/beats/{id}/upload`` queues RENDER (which chains UPLOAD).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from beat_server.api.schemas import BeatOut, BeatPatch, JobOut, PrivacyIn
from beat_server.db.models import Beat, BeatStatus, JobKind
from beat_server.db.repo import BeatRepo, SettingsRepo
from beat_server.deps import get_session, get_workspace
from beat_server.jobs.events import EventBus
from beat_server.jobs.queue import JobQueue
from beat_server.services.beats import (
    EDITABLE,
    apply_patch,
    create_draft,
    default_metadata,
    delete_draft,
)
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


def get_queue(request: Request) -> JobQueue:
    return request.app.state.queue


QueueDep = Annotated[JobQueue, Depends(get_queue)]


def load_beat(session: Session, beat_id: str) -> Beat:
    beat = BeatRepo(session).get(beat_id)
    if beat is None:
        raise BeatNotFound(f"Beat {beat_id} does not exist.")
    return beat


@router.get("", response_model=list[BeatOut])
def list_beats(session: SessionDep) -> list[BeatOut]:
    return [BeatOut.from_beat(beat) for beat in BeatRepo(session).list()]


@router.post("", response_model=BeatOut, status_code=201)
def create_beat(
    session: SessionDep,
    ws: WorkspaceDep,
    audio: Annotated[UploadFile, File(description="one .mp3 or .wav")],
    image: Annotated[UploadFile, File(description="one .png/.jpg/.jpeg/.gif/.bmp")],
) -> BeatOut:
    """A new DRAFT from an audio file and a cover image (multipart form)."""
    template = default_metadata(SettingsRepo(session))
    beat = create_draft(ws, BeatRepo(session), audio, image, template)
    return BeatOut.from_beat(beat)


@router.get("/{beat_id}", response_model=BeatOut)
def get_beat(beat_id: str, session: SessionDep) -> BeatOut:
    return BeatOut.from_beat(load_beat(session, beat_id))


@router.patch("/{beat_id}", response_model=BeatOut)
def patch_beat(beat_id: str, body: BeatPatch, session: SessionDep) -> BeatOut:
    """Edit Metadata of a draft (DRAFT/QUEUED); invalid values -> 422, later states -> 409."""
    beat = load_beat(session, beat_id)
    if beat.status not in EDITABLE:
        raise BeatStateError(
            f"Beat {beat_id} is {beat.status}; metadata can only be edited before upload."
        )
    apply_patch(beat, body)
    BeatRepo(session).save(beat)
    return BeatOut.from_beat(beat)


@router.post("/{beat_id}/upload", response_model=JobOut)
def upload_beat(beat_id: str, session: SessionDep, bus: BusDep, queue: QueueDep) -> JobOut:
    """Queue the RENDER job (which chains UPLOAD). The beat becomes QUEUED."""
    beat = load_beat(session, beat_id)
    if beat.status != BeatStatus.DRAFT:
        raise BeatStateError(f"Beat {beat_id} is {beat.status}; only drafts can be uploaded.")
    if not (beat.audio_path and beat.image_path):
        raise BeatStateError(f"Beat {beat_id} has no audio or cover; add both first.")
    beat.status = BeatStatus.QUEUED
    BeatRepo(session).save(beat)
    bus.publish_beat(beat.id, beat.status)
    return JobOut.model_validate(queue.enqueue(JobKind.RENDER, beat.id))


@router.delete("/{beat_id}", status_code=204)
def delete_beat(beat_id: str, session: SessionDep, ws: WorkspaceDep) -> Response:
    """Remove a DRAFT and its files. Uploaded beats stay (they live on YouTube)."""
    delete_draft(ws, BeatRepo(session), load_beat(session, beat_id))
    return Response(status_code=204)


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
