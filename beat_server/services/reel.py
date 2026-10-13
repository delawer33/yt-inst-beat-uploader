"""The Reel as the Instagram panel sees it, and "Show in folder".

``reel_state`` says what the panel shows: the Reel is ``ready``, ``rendering`` (a REEL job
waits or runs), ``failed`` (the last REEL job failed; the panel does not queue another by
itself, or a failing render would loop) or ``unavailable`` (the Beat has no audio and cover
on disk). ``ensure_reel`` queues the REEL job the first time a Beat without a current Reel
is looked at.

``show_in_folder`` opens the file manager with the file selected. The browser cannot open a
``file://`` path, so the server does it, as the local owner (ADR 0001): D-Bus
``org.freedesktop.FileManager1.ShowItems`` through ``gdbus``, and ``xdg-open`` on the folder
when that does not work. The opener is a parameter so tests never start a program.
"""

import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from beat_server.db.models import Beat, Job, JobKind, JobStatus
from beat_server.db.repo import JobRepo
from beat_server.jobs.queue import JobQueue
from beat_server.services.errors import BeatStateError
from beat_upload.beat_folder import REEL_FILENAME
from beat_upload.errors import BeatUploadError
from beat_upload.workspace import Workspace

ReelStateName = Literal["ready", "rendering", "failed", "unavailable"]
Opener = Callable[[Path], None]

_PENDING = (JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.PAUSED)


@dataclass(frozen=True)
class ReelState:
    state: ReelStateName
    job: Job | None = None


def reel_file(ws: Workspace, beat: Beat) -> Path:
    return ws.beat_dir(beat.id) / (beat.reel_path or REEL_FILENAME)


def reel_ready(ws: Workspace, beat: Beat) -> bool:
    return beat.reel_is_current and reel_file(ws, beat).is_file()


def can_make_reel(ws: Workspace, beat: Beat) -> bool:
    """Audio and cover on disk: a Beat only synced from the channel has neither."""
    if not (beat.audio_path and beat.image_path):
        return False
    beat_dir = ws.beat_dir(beat.id)
    return (beat_dir / beat.audio_path).is_file() and (beat_dir / beat.image_path).is_file()


def reel_state(ws: Workspace, jobs: JobRepo, beat: Beat) -> ReelState:
    job = jobs.reel_job_for_beat(beat.id)
    if reel_ready(ws, beat):
        return ReelState("ready", job)
    if job is not None and job.status in _PENDING:
        return ReelState("rendering", job)
    if not can_make_reel(ws, beat):
        return ReelState("unavailable")
    if job is not None and job.status == JobStatus.FAILED:
        return ReelState("failed", job)
    return ReelState("rendering", job)  # nothing queued yet: ``ensure_reel`` is about to


def ensure_reel(ws: Workspace, jobs: JobRepo, queue: JobQueue, beat: Beat) -> ReelState:
    """Queue a REEL job if the Beat has no current Reel and none is waiting or running."""
    state = reel_state(ws, jobs, beat)
    waiting = state.job is not None and state.job.status in _PENDING
    if state.state == "rendering" and not waiting:
        job = queue.enqueue(JobKind.REEL, beat.id)
        return ReelState("rendering", job)
    return state


def show_reel(ws: Workspace, beat: Beat, opener: Opener) -> Path:
    """Open the file manager on the Reel. No Reel on disk yet -> ``BeatStateError``."""
    reel = reel_file(ws, beat)
    if not reel.is_file():
        raise BeatStateError(f"Beat {beat.id} has no Reel on disk yet.")
    opener(reel)
    return reel


def show_in_folder(path: Path) -> None:
    """Select ``path`` in the file manager; ``xdg-open`` on its folder as the fallback."""
    uri = path.resolve().as_uri()
    show_items = [
        "gdbus", "call", "--session",
        "--dest", "org.freedesktop.FileManager1",
        "--object-path", "/org/freedesktop/FileManager1",
        "--method", "org.freedesktop.FileManager1.ShowItems",
        f"['{uri}']", "",
    ]  # fmt: skip
    if _ran_ok(show_items):
        return
    if _ran_ok(["xdg-open", str(path.parent)]):
        return
    raise BeatUploadError(f"Could not open the file manager; the Reel is at {path}.")


def _ran_ok(cmd: list[str]) -> bool:
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0
