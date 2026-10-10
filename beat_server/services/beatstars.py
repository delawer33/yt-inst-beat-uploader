"""The BEATSTARS job: a Bounce Folder beat goes onto BeatStars before it goes to YouTube.

Sending a public or scheduled Beat from a Bounce Folder queues this Job next to the Render.
It builds the Track Package, drives Studio in a real browser window, releases the Track at
the moment YouTube will (now, or the Beat's publish time) and saves the Track's id the moment
Studio makes it and its URL at the end. Whichever of the Render and this Job finishes last
queues the Upload, whose description then carries the link (``with_beatstars_link``).

A Beat sent private or unlisted without a time gets no Track (``beatstars_due``). A failure
leaves the Beat Queued and the error on the Job; retrying the Job continues the Studio draft
whose id was saved.

A Published or Scheduled Beat that has no Track (sent private then published, or sent
without BeatStars) can be put on BeatStars later (``check_can_put_later``): the same Job,
released now or at the publish time, after which the Beat's YouTube snippet is sent again so
the marker in the description becomes the link (``videos.update``, 50 quota units).

Studio is synchronous Playwright, so everything that touches it or ffmpeg runs in
``asyncio.to_thread``; the two seams below (``prepare`` and ``drive_studio``) are what tests
replace.
"""

import asyncio
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from beat_server.db.models import Beat, BeatStatus, JobKind
from beat_server.db.repo import BeatRepo, JobRepo
from beat_server.jobs.worker import JobContext
from beat_server.services.beats import snippet_of
from beat_server.services.errors import BeatNotFound, BeatStateError
from beat_upload.beatstars.catalog import INSTRUMENTS, MOODS
from beat_upload.beatstars.naming import MAX_MOODS, TrackFileName, file_safe_name
from beat_upload.beatstars.package import TrackPackage, prepare_package, sources_from_bounce
from beat_upload.beatstars.studio import (
    RELEASE_NOW_WINDOW,
    check_public_page,
    public_url,
    publish_package,
    studio,
)
from beat_upload.beatstars.track import (
    BeatStarsTrack,
    mood_name,
    moods_for_genre,
    parse_youtube_title,
    track_for_beat,
)
from beat_upload.bounce_folder import read_bounce_folder
from beat_upload.errors import BeatStarsError
from beat_upload.youtube import update_description

LATER = frozenset({BeatStatus.PUBLISHED, BeatStatus.SCHEDULED})
PACKAGE_DIRNAME = "beatstars"
FALLBACK_FILE_NAME = "beat"


def beatstars_due(beat: Beat) -> bool:
    """Does this Beat still have to go onto BeatStars before its Upload? A Bounce Folder
    beat, not skipped, without a Track yet, sent public or with a publish time."""
    return (
        beat.bounce_folder is not None
        and not beat.beatstars_skipped
        and beat.beatstars_url is None
        and (beat.privacy == "public" or beat.publish_at is not None)
    )


def ready_for_upload(beat: Beat) -> bool:
    """Is the Beat's video current and nothing left to put on BeatStars first?"""
    return beat.video_is_current and not beatstars_due(beat)


def queue_upload_if_ready(ctx: JobContext, beat: Beat) -> None:
    """The follow-up of the last Job to finish: the UPLOAD, for a Queued Beat that is ready."""
    if (
        beat.status == BeatStatus.QUEUED
        and ready_for_upload(beat)
        and not JobRepo(ctx.session).has_pending(JobKind.UPLOAD, beat.id)
    ):
        ctx.enqueue(JobKind.UPLOAD, beat.id)


def release_at(beat: Beat) -> datetime | None:
    """When the Track goes public: the Beat's publish time (aware UTC), or ``None`` for now
    (no time, or one that has passed: a Published Beat keeps the time it was scheduled for)."""
    if beat.publish_at is None:
        return None
    when = beat.publish_at.replace(tzinfo=UTC)
    return when if when > datetime.now(UTC) else None


def check_can_put_later(beat: Beat) -> None:
    """``BeatStateError`` unless "Put on BeatStars" applies: a Published or Scheduled Beat from
    a Bounce Folder, on YouTube, with no Track yet. (A private Beat with no schedule is not
    sold, so it is refused; so is one that already has a Track.)"""
    if beat.bounce_folder is None:
        raise BeatStateError(
            f"Beat {beat.id} is not from a Bounce Folder; it has no BeatStars files."
        )
    if beat.beatstars_url is not None:
        raise BeatStateError(f"Beat {beat.id} is already on BeatStars: {beat.beatstars_url}")
    if beat.status not in LATER or not beat.youtube_id:
        raise BeatStateError(
            f"Beat {beat.id} is {beat.status}; only a Published or Scheduled beat can be put "
            "on BeatStars later."
        )


def track_of(beat: Beat) -> BeatStarsTrack:
    """The Track the form is filled with, from the Beat's title and Bounce Folder facts.
    ``BeatStarsError`` when the title is not ``[FREE] A Type Beat 2026 - "NAME" | Genre``."""
    if beat.bpm is None or beat.music_key is None:
        raise BeatStarsError(f"Beat {beat.id} has no BPM and key; it is not from a Bounce Folder.")
    parsed = parse_youtube_title(beat.title)
    moods = list(beat.beatstars_moods) or _default_moods(beat, parsed.genre)
    instruments = list(beat.beatstars_instruments) or _exact(beat.name_instruments, INSTRUMENTS)
    return track_for_beat(beat.title, beat.bpm, beat.music_key, moods, instruments, beat.samples)


def check_ready_to_send(beat: Beat) -> None:
    """Refuse a send that BEATSTARS could not carry out, while the owner can still fix it:
    a title that does not parse, a Bounce Folder that is gone. No-op for a Beat that skips
    BeatStars."""
    if not beatstars_due(beat):
        return
    track_of(beat)
    assert beat.bounce_folder is not None
    read_bounce_folder(Path(beat.bounce_folder))


async def run_beatstars(ctx: JobContext) -> None:
    """Put the Beat on BeatStars (if it is due), then queue the UPLOAD if nothing else waits."""
    repo = BeatRepo(ctx.session)
    beat = repo.get(ctx.job.beat_id) if ctx.job.beat_id else None
    if beat is None:
        raise BeatNotFound(f"Beat {ctx.job.beat_id} does not exist.")
    if beat.bounce_folder is None or beat.status not in {BeatStatus.QUEUED, *LATER}:
        raise BeatStateError(f"Beat {beat.id} is {beat.status}; only a sent Bounce Folder beat.")

    if beatstars_due(beat):
        track = track_of(beat)
        bounce = beat.bounce_folder
        package_dir = ctx.workspace.beat_dir(beat.id) / PACKAGE_DIRNAME
        ctx.progress(0.0, "Preparing the Track Package")
        package = await asyncio.to_thread(
            prepare, Path(bounce), track, parse_youtube_title(beat.title).name, package_dir
        )

        beat_id = beat.id

        def remember(track_id: str) -> None:
            with ctx.new_session() as session:
                row = BeatRepo(session).get(beat_id)
                if row is not None:
                    row.beatstars_id = track_id
                    BeatRepo(session).save(row)

        ctx.progress(0.1, "Opening BeatStars Studio")
        track_id, url = await asyncio.to_thread(
            drive_studio,
            ctx.workspace.beatstars_profile,
            package,
            beat.beatstars_id,
            release_at(beat),
            remember,
            ctx.log,
        )
        ctx.session.refresh(beat)
        beat.beatstars_id = track_id
        beat.beatstars_url = url
        repo.save(beat)
        ctx.bus.publish_beat(beat.id, beat.status)
        ctx.progress(1.0, f"On BeatStars as {track_id}")
    else:
        ctx.log("Nothing to put on BeatStars")
    ctx.session.refresh(beat)
    if beat.youtube_id and beat.beatstars_url:
        # Put on BeatStars later: the video is up, so its description gets the link now.
        ctx.progress(0.95, "Adding the link to the YouTube description")
        creds = ctx.credentials()  # AuthError -> the worker pauses the job; a rerun skips Studio
        await asyncio.to_thread(update_description, beat.youtube_id, snippet_of(beat), creds)
        ctx.progress(1.0, "YouTube description updated")
    queue_upload_if_ready(ctx, beat)


def prepare(bounce: Path, track: BeatStarsTrack, name: str, out_dir: Path) -> TrackPackage:
    """The Track Package of the Bounce Folder in ``out_dir``: trimmed master, tagged MP3,
    square cover, stems zip, files named after the beat's ``name``. Blocking (ffmpeg)."""
    folder = read_bounce_folder(bounce)
    facts = TrackFileName(
        name=file_safe_name(name) or FALLBACK_FILE_NAME,
        bpm=track.bpm,
        key=track.key,
        samples=track.samples,
    )
    sources = sources_from_bounce(folder.master, folder.tagged, folder.cover, folder.stems, out_dir)
    return prepare_package(sources, facts, track, out_dir)


def drive_studio(
    profile: Path,
    package: TrackPackage,
    draft: str | None,
    release: datetime | None,
    on_created: Callable[[str], None],
    on_status: Callable[[str], None],
) -> tuple[str, str]:
    """Fill and release the track in Studio; returns its ``TK`` id and public URL. Blocking.

    Studio's window opens on the display of the process (WAYLAND_DISPLAY for the service).
    A Track released now is looked up on its public page; if that check fails the Track is
    still public, so the plain URL is used and the problem goes to the job's log.
    """
    with studio(profile, on_status) as page:
        track_id = publish_package(page, package, on_status, draft, True, release, on_created)
        scheduled = release is not None and release - datetime.now(UTC) > RELEASE_NOW_WINDOW
        if scheduled:
            return track_id, public_url(track_id)
        try:
            return track_id, check_public_page(page, track_id, package.track.bpm)
        except BeatStarsError as e:
            on_status(f"{track_id} is public, but its page check failed: {e}")
            return track_id, public_url(track_id)


def _default_moods(beat: Beat, genre: str) -> list[str]:
    """Moods never matched (Fill from title not run): the name's words that are on Studio's
    list as they are, then the genre's own moods, five at most."""
    moods = _exact(beat.name_moods, MOODS)
    for mood in moods_for_genre(genre):
        if mood not in moods:
            moods.append(mood)
    return moods[:MAX_MOODS]


def _exact(words: list[str], catalog: tuple[str, ...]) -> list[str]:
    """The ``words`` that are on ``catalog`` once capitalised ('dark' -> 'Dark'), in order."""
    wanted = {item.lower(): item for item in catalog}
    found: list[str] = []
    for word in words:
        item = wanted.get(mood_name(word).lower())
        if item is not None and item not in found:
            found.append(item)
    return found
