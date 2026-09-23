"""The two job handlers that turn a draft into a video on YouTube: RENDER, then UPLOAD.

``run_render`` finishes by enqueueing UPLOAD, so one click on "Upload to YouTube" runs the
whole chain. ffmpeg and the Data API run in ``asyncio.to_thread``; only ``ctx.progress`` is
called from there, never ``ctx.session``.

Failure rules: a render or upload error puts the beat back to DRAFT so the user can fix
things and press Upload again (the rendered ``video.mp4`` is kept and reused). A missing
Google connection (``AuthError``) leaves the status alone: the worker pauses the job and
reruns it after reconnect. A ``NetworkError`` during the upload (laptop went to sleep,
Wi-Fi down) puts the beat back to QUEUED while the worker retries the job; only when the
retries are exhausted does it become a DRAFT again.
"""

import asyncio
from pathlib import Path

from beat_server.db.models import Beat, BeatStatus, JobKind, utcnow
from beat_server.db.repo import BeatRepo
from beat_server.jobs.worker import JobContext, has_retries_left
from beat_server.services.beats import metadata_of
from beat_server.services.errors import BeatNotFound, BeatStateError
from beat_server.services.sync import status_from_privacy
from beat_upload.beat_folder import VIDEO_FILENAME
from beat_upload.errors import AuthError, BeatUploadError, NetworkError
from beat_upload.video import render_video
from beat_upload.youtube import upload_video

RENDERABLE = frozenset({BeatStatus.DRAFT, BeatStatus.QUEUED})


async def run_render(ctx: JobContext) -> None:
    """DRAFT/QUEUED -> RENDERING -> video.mp4 on disk -> QUEUED, UPLOAD job enqueued.

    The beat goes back to QUEUED once the file exists so that a beat waiting for its
    UPLOAD job (queued, or paused on a missing Google connection) is not shown as
    ``rendering``; ``run_upload`` moves it to UPLOADING when it actually starts.
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

    _set_status(ctx, repo, beat, BeatStatus.RENDERING)
    try:
        if video.is_file():
            ctx.log(f"{VIDEO_FILENAME} already rendered, skipping ffmpeg")
        else:
            ctx.progress(0.0, "Rendering")
            await asyncio.to_thread(
                render_video, audio, image, video, lambda f: ctx.progress(f, "Rendering")
            )
    except BeatUploadError:
        _set_status(ctx, repo, beat, BeatStatus.DRAFT)
        raise
    beat.video_path = VIDEO_FILENAME
    _set_status(ctx, repo, beat, BeatStatus.QUEUED)
    ctx.progress(1.0, "Rendered")
    ctx.enqueue(JobKind.UPLOAD, beat.id)


async def run_upload(ctx: JobContext) -> None:
    """-> UPLOADING -> UPLOADED (private/unlisted) or PUBLISHED (public); sets youtube_id."""
    repo = BeatRepo(ctx.session)
    beat = _load(ctx, repo)
    if beat.youtube_id:
        raise BeatStateError(f"Beat {beat.id} is already on YouTube ({beat.youtube_id}).")
    video = _video_file(ctx, beat)
    metadata = metadata_of(beat)

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
    _set_status(ctx, repo, beat, status_from_privacy(beat.privacy))
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
