"""The two job handlers that turn a draft into a video on YouTube: RENDER, then UPLOAD.

The RENDER paints the cover in the Beat's Cover Style and loops it for the whole beat
(ffmpeg, Still): the YouTube video never moves. The Beat's Effect moves the Reel alone
(ADR 0012), in the REEL job below: Still loops the frame through ffmpeg, any other Effect
has the engine draw every frame (ADR 0011). The owner may change the Cover Style on a Draft at
any time; the PATCH queues a new RENDER, and ``video_style`` says what the video on disk
has. A RENDER whose video already matches skips the work, and one that finishes with a
style the owner has since changed never leads to an UPLOAD.

The RENDER starts when the Beat is created, before the owner has decided anything (ADR 0004),
so it never touches the Beat's status: that says what the owner did. It only records the
rendered file and, if the owner has already sent the Beat (QUEUED) and nothing is left to put
on BeatStars first (``services/beatstars.py``), enqueues the UPLOAD behind itself. A Render
that finishes on a Draft leaves it a Rendered Draft and stops there; the send action enqueues
the UPLOAD itself once it sees the video.

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
from collections.abc import Callable
from pathlib import Path
from typing import Any

from beat_server.db.models import Beat, BeatStatus, JobKind, utcnow
from beat_server.db.repo import BeatRepo, JobRepo
from beat_server.jobs.worker import JobContext, has_retries_left
from beat_server.services.beats import metadata_of
from beat_server.services.beatstars import queue_upload_if_ready
from beat_server.services.effects import effect_meta_of, effect_seed_of
from beat_server.services.errors import BeatNotFound, BeatStateError
from beat_server.services.sync import status_for
from beat_upload.beat_folder import REEL_FILENAME, VIDEO_FILENAME
from beat_upload.errors import AuthError, BeatUploadError, ConfigError, NetworkError
from beat_upload.video import ProgressFn, render_clip, render_reel, render_video
from beat_upload.visual import STILL
from beat_upload.visual.bake import bake_for, render_from_bake, stone_for
from beat_upload.visual.render import Format, RenderPlan, render_effect
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

    if video.is_file() and beat.video_is_current:
        ctx.log(f"{VIDEO_FILENAME} already rendered in {beat.video_style or 'its style'}")
    else:
        style = beat.cover_style
        # Written next to the video and moved over it only if the owner still wants this
        # style, so the video on disk is always whole and matches its columns.
        part = video.with_name(f"{video.stem}.part{video.suffix}")
        ctx.workspace.require_free_space("the video")
        ctx.progress(0.0, "Rendering")
        try:
            await asyncio.to_thread(
                _render_still,
                beat,
                "yt",
                audio,
                image,
                part,
                lambda f: ctx.progress(f, "Rendering"),
            )
            ctx.session.refresh(beat)  # the owner may have picked another style meanwhile
            if beat.cover_style == style:
                part.replace(video)
                beat.video_style = style
                beat.video_path = VIDEO_FILENAME
                repo.save(beat)
            else:
                ctx.log(f"Rendered {style}, but the beat changed meanwhile; dropped")
        finally:
            part.unlink(missing_ok=True)
    ctx.progress(1.0, "Rendered")
    # The owner may have sent the beat or changed its style while ffmpeg ran: read it back.
    ctx.session.refresh(beat)
    ctx.bus.publish_beat(beat.id, beat.status)
    jobs = JobRepo(ctx.session)
    if not beat.video_is_current:
        if not jobs.has_waiting(JobKind.RENDER, beat.id):
            ctx.enqueue(JobKind.RENDER, beat.id)
    else:
        queue_upload_if_ready(ctx, beat)  # not while the BEATSTARS job still has the beat


async def run_reel(ctx: JobContext) -> None:
    """reel.mp4 on disk, for a Beat in any status that has audio and cover: the Beat's
    Effect over its Cover Style (Still through ffmpeg, any other through the engine).

    Never touches the Beat's status and never leads to an UPLOAD: the Reel is for Instagram
    and nothing waits for it. Like the RENDER it writes a ``.part`` file and moves it over
    only if the owner still wants the style, the Effect and the header it was painted with;
    when any changed while it rendered, another REEL is queued.
    """
    repo = BeatRepo(ctx.session)
    beat = _load(ctx, repo)
    if not (beat.audio_path and beat.image_path):
        raise BeatStateError(f"Beat {beat.id} has no audio or cover; add both first.")
    _check_header_ready(beat)

    beat_dir = ctx.workspace.beat_dir(beat.id)
    audio = beat_dir / beat.audio_path
    image = beat_dir / beat.image_path
    reel = beat_dir / REEL_FILENAME

    if reel.is_file() and beat.reel_is_current:
        ctx.log(f"{REEL_FILENAME} already rendered in {beat.reel_style}")
    else:
        style, fx, header = beat.cover_style, beat.effect, beat.header
        part = reel.with_name(f"{reel.stem}.part{reel.suffix}")
        ctx.workspace.require_free_space("the Reel")
        ctx.progress(0.0, "Rendering the Reel")
        try:
            await asyncio.to_thread(
                _render_reel,
                beat,
                audio,
                image,
                part,
                lambda f: ctx.progress(f, "Rendering the Reel"),
                ctx.log,
                ctx.workspace.bakes_dir,
            )
            ctx.session.refresh(beat)  # the owner may have picked another style meanwhile
            if beat.cover_style == style and beat.effect == fx and _same_header(beat, header):
                part.replace(reel)
                beat.reel_style = style
                beat.reel_effect = fx
                beat.reel_meta = None if fx == STILL else header
                beat.reel_path = REEL_FILENAME
                repo.save(beat)
            else:
                ctx.log(f"Rendered {style} / {fx}, but the beat changed meanwhile; dropped")
        finally:
            part.unlink(missing_ok=True)
    ctx.progress(1.0, "Reel rendered")
    ctx.session.refresh(beat)
    ctx.bus.publish_beat(beat.id, beat.status)
    if (
        not beat.reel_is_current
        and beat.header_ready
        and not JobRepo(ctx.session).has_waiting(JobKind.REEL, beat.id)
    ):
        ctx.enqueue(JobKind.REEL, beat.id)


def _check_header_ready(beat: Beat) -> None:
    """An Effect paints the title into every frame: no Reel before the title names the
    beat (``Beat.header_ready``). Still never waits."""
    if not beat.header_ready:
        raise BeatStateError(
            f"Beat {beat.id} has the {beat.effect} effect but no title yet; the header is "
            "drawn into the Reel, so give the beat its title first."
        )


def _same_header(beat: Beat, header: dict[str, Any]) -> bool:
    return beat.effect == STILL or beat.header == header


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


def _render_still(
    beat: Beat, fmt: Format, audio: Path, image: Path, output: Path, on_progress: ProgressFn
) -> Path:
    """One Still file for ``beat`` through ffmpeg alone: the cover in its Cover Style (a Clip
    looped in the cover's place) standing for the whole beat. Runs in a worker thread;
    ``beat`` is only read."""
    if beat.clip_path:
        clip = Path(beat.clip_path)
        return render_clip(audio, clip, output, on_progress, style=beat.cover_style, fmt=fmt)
    still = render_video if fmt == "yt" else render_reel
    return still(audio, image, output, on_progress, style=beat.cover_style)


def _render_reel(
    beat: Beat,
    audio: Path,
    image: Path,
    output: Path,
    on_progress: ProgressFn,
    on_status: Callable[[str], None],
    bakes_dir: Path,
) -> Path:
    """The Reel: Still through ffmpeg; a baked object Effect (``visual/bake.py``) as its loop
    under the header, through ffmpeg too; any other Effect through the engine. A Clip takes
    the cover's place in the first and the last. Runs in a worker thread; ``beat`` is only
    read."""
    if beat.effect == STILL:
        return _render_still(beat, "reel", audio, image, output, on_progress)
    seed = effect_seed_of(beat)
    baked = bake_for(bakes_dir, beat.effect, seed)
    if baked is not None:
        on_status(f"Playing the bake {baked.name}")
        return render_from_bake(audio, baked, effect_meta_of(beat), output, on_progress)
    plan = RenderPlan(
        effect=beat.effect,
        style=beat.cover_style,
        format="reel",
        meta=effect_meta_of(beat),
        seed=seed,
        stone=stone_for(beat.effect, seed),
    )
    clip = Path(beat.clip_path) if beat.clip_path else None
    return render_effect(audio, image, output, plan, on_progress, on_status, clip=clip)


def _load(ctx: JobContext, repo: BeatRepo) -> Beat:
    beat = repo.get(ctx.job.beat_id) if ctx.job.beat_id else None
    if beat is None:
        raise BeatNotFound(f"Beat {ctx.job.beat_id} does not exist.")
    return beat


def _video_file(ctx: JobContext, beat: Beat) -> Path:
    video = ctx.workspace.beat_dir(beat.id) / (beat.video_path or VIDEO_FILENAME)
    if not beat.video_path or not video.is_file():
        raise BeatStateError(f"Beat {beat.id} has no rendered video; render it first.")
    if not beat.video_is_current:
        raise BeatStateError(
            f"Beat {beat.id} was rendered in {beat.video_style}, not {beat.cover_style}; "
            "render it again first."
        )
    return video


def _set_status(ctx: JobContext, repo: BeatRepo, beat: Beat, status: BeatStatus) -> None:
    beat.status = status
    repo.save(beat)
    ctx.bus.publish_beat(beat.id, beat.status)
