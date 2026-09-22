"""Registry of job handlers. Bodies live in ``beat_server/services``; this maps kinds to them.

SYNC is a stub until the library sync service lands; RENDER/UPLOAD/STATS until the pipeline.
"""

from beat_server.db.models import JobKind
from beat_server.jobs.worker import JobContext, JobHandler
from beat_upload.errors import BeatUploadError


async def run_sync(ctx: JobContext) -> None:
    ctx.log("sync not implemented yet")
    ctx.progress(1.0, "sync not implemented yet")


async def run_render(ctx: JobContext) -> None:
    raise BeatUploadError("Render is not implemented yet.")


async def run_upload(ctx: JobContext) -> None:
    raise BeatUploadError("Upload is not implemented yet.")


async def run_stats(ctx: JobContext) -> None:
    raise BeatUploadError("Stats refresh is not implemented yet.")


HANDLERS: dict[JobKind, JobHandler] = {
    JobKind.SYNC: run_sync,
    JobKind.RENDER: run_render,
    JobKind.UPLOAD: run_upload,
    JobKind.STATS: run_stats,
}
