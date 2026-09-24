"""The Library over HTTP: list, one beat, its cover, its privacy; create, edit, send
and delete a draft.

Multipart ``POST /api/beats`` stores the files, applies the owner's templates and queues the
RENDER at once (ADR 0004), so the video is being produced while the owner writes the
Metadata. ``POST /api/beats/{id}/upload`` is the send action: the beat becomes QUEUED
immediately and the UPLOAD is queued now if the video is already there, otherwise by the
RENDER when it finishes.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from beat_server.api.schemas import BeatOut, BeatPatch, PrivacyIn
from beat_server.db.models import Beat, BeatStatus, JobKind
from beat_server.db.repo import BeatRepo, JobRepo, SettingsRepo
from beat_server.deps import get_session, get_workspace
from beat_server.jobs.events import EventBus
from beat_server.jobs.queue import JobQueue
from beat_server.services.beats import (
    EDITABLE,
    apply_patch,
    create_draft,
    default_metadata,
    delete_draft,
    metadata_of,
    metadata_with_privacy,
    to_naive_utc,
)
from beat_server.services.errors import BeatNotFound, BeatStateError
from beat_server.services.sync import status_for
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


def beat_out(session: Session, beat: Beat) -> BeatOut:
    """``BeatOut`` with the Job that is happening on this beat right now attached."""
    return BeatOut.from_beat(beat, JobRepo(session).active_for_beat(beat.id))


def load_beat(session: Session, beat_id: str) -> Beat:
    beat = BeatRepo(session).get(beat_id)
    if beat is None:
        raise BeatNotFound(f"Beat {beat_id} does not exist.")
    return beat


@router.get("", response_model=list[BeatOut])
def list_beats(session: SessionDep) -> list[BeatOut]:
    active = JobRepo(session).active_by_beat()
    return [BeatOut.from_beat(beat, active.get(beat.id)) for beat in BeatRepo(session).list()]


@router.post("", response_model=BeatOut, status_code=201)
def create_beat(
    session: SessionDep,
    ws: WorkspaceDep,
    queue: QueueDep,
    audio: Annotated[UploadFile, File(description="one .mp3 or .wav")],
    image: Annotated[UploadFile, File(description="one .png/.jpg/.jpeg/.gif/.bmp")],
) -> BeatOut:
    """A new DRAFT from an audio file and a cover image (multipart form).

    The RENDER is queued here and comes back as ``active_job``; no UPLOAD is created, that
    waits for the owner to send the beat.
    """
    template = default_metadata(SettingsRepo(session))
    beat = create_draft(ws, BeatRepo(session), audio, image, template)
    job = queue.enqueue(JobKind.RENDER, beat.id)
    return BeatOut.from_beat(beat, job)


@router.get("/{beat_id}", response_model=BeatOut)
def get_beat(beat_id: str, session: SessionDep) -> BeatOut:
    return beat_out(session, load_beat(session, beat_id))


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
    return beat_out(session, beat)


@router.post("/{beat_id}/upload", response_model=BeatOut)
def upload_beat(
    beat_id: str, session: SessionDep, ws: WorkspaceDep, bus: BusDep, queue: QueueDep
) -> BeatOut:
    """Send the beat: "Save & upload when rendered". The beat becomes QUEUED at once.

    The UPLOAD is queued here when the video is already Rendered, and by the RENDER that is
    still running otherwise. A beat whose render failed (no video, no render pending) gets a
    fresh RENDER, so sending is always enough on its own.
    """
    beat = load_beat(session, beat_id)
    if beat.status != BeatStatus.DRAFT:
        raise BeatStateError(f"Beat {beat_id} is {beat.status}; only drafts can be uploaded.")
    if not (beat.audio_path and beat.image_path):
        raise BeatStateError(f"Beat {beat_id} has no audio or cover; add both first.")
    metadata_of(beat)  # a passed publish_at is a 422 now, not a failed upload after rendering
    beat.status = BeatStatus.QUEUED
    BeatRepo(session).save(beat)
    bus.publish_beat(beat.id, beat.status)

    jobs = JobRepo(session)
    video = ws.beat_dir(beat.id) / beat.video_path if beat.video_path else None
    if video is not None and video.is_file():
        if not jobs.has_pending(JobKind.UPLOAD, beat.id):
            queue.enqueue(JobKind.UPLOAD, beat.id)
    elif not jobs.has_pending(JobKind.RENDER, beat.id):
        queue.enqueue(JobKind.RENDER, beat.id)
    return beat_out(session, beat)


@router.delete("/{beat_id}", status_code=204)
def delete_beat(beat_id: str, session: SessionDep, ws: WorkspaceDep, queue: QueueDep) -> Response:
    """Remove a DRAFT, its files and its pending Jobs. Uploaded beats stay (on YouTube).

    A Render that is already running is left to notice the beat is gone and fail itself;
    ADR 0004 accepts the wasted minute of CPU.
    """
    beat = load_beat(session, beat_id)
    delete_draft(ws, BeatRepo(session), beat)
    queue.cancel_for_beat(beat_id)
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
    """Change the privacy of an uploaded beat on YouTube, then mirror it locally.

    With ``publish_at`` the beat is (re)scheduled: sent as private with that time, status
    SCHEDULED. Without it the status part is replaced without a time, so a Scheduled beat
    loses its schedule: private/unlisted -> UPLOADED, public -> PUBLISHED (publish now).
    """
    beat = load_beat(session, beat_id)
    if not beat.youtube_id:
        raise BeatStateError(f"Beat {beat_id} is not on YouTube yet; upload it first.")
    metadata = metadata_with_privacy(beat, body.privacy, body.publish_at)  # ConfigError -> 422
    credentials = get_valid_credentials(ws)  # AuthError -> 409
    set_privacy(beat.youtube_id, metadata.privacy_status, credentials, metadata.publish_at)
    beat.privacy = metadata.privacy_status.value
    beat.publish_at = to_naive_utc(metadata.publish_at)
    beat.status = status_for(beat.privacy, beat.publish_at)
    BeatRepo(session).save(beat)
    bus.publish_beat(beat.id, beat.status)
    return beat_out(session, beat)
