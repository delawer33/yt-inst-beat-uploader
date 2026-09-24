"""The two job handlers that turn a draft into a video on YouTube: RENDER, then UPLOAD.

The RENDER starts when the Beat is created, before the owner has decided anything (ADR 0004),
so it never touches the Beat's status: that says what the owner did. It only records the
rendered file and, if the owner has already sent the Beat (QUEUED), enqueues the UPLOAD
behind itself. A Render that finishes on a Draft leaves it a Rendered Draft and stops there;
the send action enqueues the UPLOAD itself once it sees the video.

ffmpeg and the Data API run in ``asyncio.to_thread``; only ``ctx.progress`` is called from
there, never ``ctx.session``.

A Scheduled draft (private with ``publish_at``) is uploaded with ``status.publishAt``; the
metadata validator runs again right before the upload, so a publish time that has passed
while the job waited fails the job with a message naming the time and the beat goes back
to DRAFT for the user to pick a new one (ADR 0003: never silently moved).

Failure rules: a failed render leaves the Beat's status alone (a Draft stays a Draft, a
Queued beat stays Queued) and the failure is on the Job, where retrying it re-runs the
render and, for a Queued beat, the upload behind it. An upload error puts the beat back to
DRAFT so the user can fix things and send it again (the rendered ``video.mp4`` is kept and
reused). A missing Google connection (``AuthError``) leaves the status alone: the worker
pauses the job and reruns it after reconnect. A ``NetworkError`` during the upload (laptop
went to sleep,
Wi-Fi down) puts the beat back to QUEUED while the worker retries the job; only when the
retries are exhausted does it become a DRAFT again.
"""

import asyncio
from pathlib import Path

from beat_server.db.models import Beat, BeatStatus, JobKind, utcnow
from beat_server.db.repo import BeatRepo, JobRepo
from beat_server.jobs.worker import JobContext, has_retries_left
from beat_server.services.beats import metadata_of
from beat_server.services.errors import BeatNotFound, BeatStateError
from beat_server.services.sync import status_for
from beat_upload.beat_folder import VIDEO_FILENAME
from beat_upload.errors import AuthError, BeatUploadError, ConfigError, NetworkError
from beat_upload.video import render_video
from beat_upload.youtube import upload_video

RENDERABLE = frozenset({BeatStatus.DRAFT, BeatStatus.QUEUED})


async def run_render(ctx: JobContext) -> None:
    """video.mp4 on disk; the Beat's status is left as the owner set it.

    Enqueues the UPLOAD behind itself only for a Beat the owner has already sent (QUEUED).
    A Draft just becomes a Rendered Draft and waits for the owner.
    """
    repo = BeatRepo(ctx.session)
    beat = _load(ctx, repo)
    if beat.status not in RENDERABLE:
        raise BeatStateError(f"Beat {beat.id} is {beat.status}; only drafts can be rendered.")
    if not (beat.audio_path and beat.image_path):
        raise BeatStateError(f"Beat {beat.id} has no audio or cover; add both first.")

    beat_dir = ctx.workspace.beat_dir(beat.id)
    audio = beat_dir / beat.audio_path
    image = beat_dir / beat.image_path
    video = beat_dir / VIDEO_FILENAME

    if video.is_file():
        ctx.log(f"{VIDEO_FILENAME} already rendered, skipping ffmpeg")
    else:
        ctx.progress(0.0, "Rendering")
        await asyncio.to_thread(
            render_video, audio, image, video, lambda f: ctx.progress(f, "Rendering")
        )
    beat.video_path = VIDEO_FILENAME
    repo.save(beat)
    ctx.progress(1.0, "Rendered")
    # The owner may have sent the beat while ffmpeg ran, so read the status back first.
    ctx.session.refresh(beat)
    ctx.bus.publish_beat(beat.id, beat.status)
    if beat.status == BeatStatus.QUEUED and not JobRepo(ctx.session).has_pending(
        JobKind.UPLOAD, beat.id
    ):
        ctx.enqueue(JobKind.UPLOAD, beat.id)


async def run_upload(ctx: JobContext) -> None:
    """-> UPLOADING -> UPLOADED (private/unlisted), SCHEDULED (private + publish_at) or
    PUBLISHED (public); sets youtube_id."""
    repo = BeatRepo(ctx.session)
    beat = _load(ctx, repo)
    if beat.youtube_id:
        raise BeatStateError(f"Beat {beat.id} is already on YouTube ({beat.youtube_id}).")
    video = _video_file(ctx, beat)
    try:
        metadata = metadata_of(beat)
    except ConfigError:  # publish_at passed while the job waited: the user picks a new one
        _set_status(ctx, repo, beat, BeatStatus.DRAFT)
        raise

    try:
        creds = ctx.credentials()  # AuthError -> the worker pauses this job
        _set_status(ctx, repo, beat, BeatStatus.UPLOADING)
        ctx.progress(0.0, "Uploading")
        youtube_id = await asyncio.to_thread(
            upload_video, video, metadata, creds, lambda f: ctx.progress(f, "Uploading")
        )
    except AuthError:
        raise
    except NetworkError:
        retrying = has_retries_left(ctx.job)
        _set_status(ctx, repo, beat, BeatStatus.QUEUED if retrying else BeatStatus.DRAFT)
        raise
    except BeatUploadError:
        _set_status(ctx, repo, beat, BeatStatus.DRAFT)
        raise
    beat.youtube_id = youtube_id
    beat.published_at = utcnow()
    _set_status(ctx, repo, beat, status_for(beat.privacy, beat.publish_at))
    ctx.progress(1.0, f"Uploaded as {youtube_id}")


def _load(ctx: JobContext, repo: BeatRepo) -> Beat:
    beat = repo.get(ctx.job.beat_id) if ctx.job.beat_id else None
    if beat is None:
        raise BeatNotFound(f"Beat {ctx.job.beat_id} does not exist.")
    return beat


def _video_file(ctx: JobContext, beat: Beat) -> Path:
    video = ctx.workspace.beat_dir(beat.id) / (beat.video_path or VIDEO_FILENAME)
    if not beat.video_path or not video.is_file():
        raise BeatStateError(f"Beat {beat.id} has no rendered video; render it first.")
    return video


def _set_status(ctx: JobContext, repo: BeatRepo, beat: Beat, status: BeatStatus) -> None:
    beat.status = status
    repo.save(beat)
    ctx.bus.publish_beat(beat.id, beat.status)
