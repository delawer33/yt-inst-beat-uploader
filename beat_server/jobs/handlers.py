"""Registry of job handlers. Bodies live in ``beat_server/services``; this maps kinds to them."""

from beat_server.db.models import JobKind
from beat_server.jobs.worker import JobHandler
from beat_server.services.beatstars import run_beatstars
from beat_server.services.pipeline import run_reel, run_render, run_upload
from beat_server.services.stats import run_stats
from beat_server.services.sync import run_sync

HANDLERS: dict[JobKind, JobHandler] = {
    JobKind.SYNC: run_sync,
    JobKind.RENDER: run_render,
    JobKind.REEL: run_reel,
    JobKind.UPLOAD: run_upload,
    JobKind.BEATSTARS: run_beatstars,
    JobKind.STATS: run_stats,
}
