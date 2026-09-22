"""Registry of job handlers. Bodies live in ``beat_server/services``; this maps kinds to them.

STATS is a stub until the stats service lands.
"""

from beat_server.db.models import JobKind
from beat_server.jobs.worker import JobContext, JobHandler
from beat_server.services.pipeline import run_render, run_upload
from beat_server.services.sync import run_sync
from beat_upload.errors import BeatUploadError


async def run_stats(ctx: JobContext) -> None:
    raise BeatUploadError("Stats refresh is not implemented yet.")


HANDLERS: dict[JobKind, JobHandler] = {
    JobKind.SYNC: run_sync,
    JobKind.RENDER: run_render,
    JobKind.UPLOAD: run_upload,
    JobKind.STATS: run_stats,
}
