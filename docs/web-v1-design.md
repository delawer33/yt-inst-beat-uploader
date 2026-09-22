# Design: Web UI v1

Source: [docs/web-v1.md](web-v1.md), [PRD](web-v1-prd.md). Status: reviewed.

Build-time artifact: paths and signatures here go stale on purpose once the code exists.

Package naming: the server lives in `beat_server/` (not `server/` — a top-level package named
`server` collides with too much). Frontend in `web/`.

Stack decisions fixed here: SQLAlchemy 2.0 (sync, `sqlite3`) + Alembic for migrations;
FastAPI sync endpoints for DB work (FastAPI runs them in a threadpool), asyncio for the worker;
blocking Google calls wrapped in `asyncio.to_thread`. Frontend: Vite + React 19 + TS,
Tailwind v4 + shadcn/ui, TanStack Query, react-router, `openapi-typescript` + `openapi-fetch`.

---

## Slice 1: Workspace and server skeleton

**Write-set:** `beat_upload/workspace.py` NEW, `beat_upload/auth.py` EDIT, `beat_upload/cli.py` EDIT,
`beat_server/{__init__,app,settings,deps}.py` NEW, `beat_server/db/{__init__,engine,models,repo}.py` NEW,
`alembic/` NEW, `pyproject.toml` EDIT, `tests/test_workspace.py` NEW, `tests/server/conftest.py` NEW.
**Depends on:** none.

### File placement

```
beat_upload/
├── workspace.py            NEW   paths of one channel owner's data; replaces auth.CONFIG_DIR globals
├── auth.py                 EDIT  functions take a Workspace instead of module constants
└── cli.py                  EDIT  builds Workspace.default(); adds `serve`
beat_server/
├── __init__.py             NEW
├── app.py                  NEW   create_app(workspace) -> FastAPI
├── settings.py             NEW   ServerSettings (port, data dir) from env / defaults
├── deps.py                 NEW   FastAPI dependencies: get_workspace, get_session
└── db/
    ├── engine.py           NEW   make_engine(path), session factory
    ├── models.py           NEW   SQLAlchemy tables
    └── repo.py             NEW   BeatRepo, JobRepo, StatsRepo, SettingsRepo
alembic/                    NEW   migrations, 0001_initial
tests/server/conftest.py    NEW   app + in-memory sqlite fixtures
```

### Signatures

```python
# beat_upload/workspace.py
@dataclass(frozen=True)
class Workspace:
    """Everything one channel owner owns on disk. One per machine today."""
    config_dir: Path   # client secrets, token           (~/.config/beat-upload)
    data_dir: Path     # sqlite, beat files              (~/.local/share/beat-upload)

    @classmethod
    def default(cls) -> "Workspace": ...          # platformdirs
    @property
    def token_file(self) -> Path: ...
    @property
    def secrets_file(self) -> Path: ...
    @property
    def db_file(self) -> Path: ...
    def beat_dir(self, beat_id: str) -> Path: ... # data_dir / "beats" / beat_id

# beat_upload/auth.py  (same bodies, explicit workspace)
def save_client_secrets(ws: Workspace, client_id: str, client_secret: str) -> None: ...
def run_login_flow(ws: Workspace) -> Credentials: ...        # CLI path, unchanged behaviour
def get_valid_credentials(ws: Workspace) -> Credentials: ...
def save_token(ws: Workspace, creds: Credentials) -> None: ...  # was private; web flow needs it
```

```python
# beat_server/db/models.py
class BeatStatus(StrEnum):
    DRAFT = "draft"; QUEUED = "queued"; RENDERING = "rendering"
    UPLOADING = "uploading"; UPLOADED = "uploaded"; PUBLISHED = "published"

class Beat(Base):
    id: str                      # uuid4
    status: BeatStatus
    title: str; description: str; tags: list[str] (JSON); category_id: int; privacy: str
    youtube_id: str | None       # unique; set after upload or by sync
    audio_path: str | None; image_path: str | None; video_path: str | None   # relative to beat_dir
    published_at: datetime | None
    views: int; likes: int; comments: int     # latest snapshot, denormalised for the card
    synced_at: datetime | None; created_at: datetime; updated_at: datetime

class Job(Base):
    id: str; beat_id: str | None; kind: JobKind; status: JobStatus
    progress: float              # 0..1
    message: str                 # last progress line
    error: str | None
    created_at; started_at: datetime | None; finished_at: datetime | None

class JobKind(StrEnum):   RENDER = "render"; UPLOAD = "upload"; SYNC = "sync"; STATS = "stats"
class JobStatus(StrEnum): QUEUED = "queued"; RUNNING = "running"; DONE = "done"; FAILED = "failed"; PAUSED = "paused"

class VideoStatsDaily(Base):     # one row per video per day, from the Analytics API
    youtube_id: str; day: date   # composite PK
    views: int; watch_minutes: int; avg_view_seconds: int; avg_view_percent: float

class Setting(Base):             # key/value: google_client_id, stats_hour, ...
    key: str; value: str
```

```python
# beat_server/db/repo.py  — thin, typed, no business rules
class BeatRepo:
    def __init__(self, session: Session): ...
    def get(self, beat_id: str) -> Beat | None: ...
    def by_youtube_id(self, youtube_id: str) -> Beat | None: ...
    def list(self) -> list[Beat]: ...                     # newest first
    def add(self, beat: Beat) -> Beat: ...
    def save(self, beat: Beat) -> Beat: ...

class JobRepo:
    def add(self, job: Job) -> Job: ...
    def next_queued(self) -> Job | None: ...
    def running(self) -> list[Job]: ...
    def for_beat(self, beat_id: str) -> list[Job]: ...
    def save(self, job: Job) -> Job: ...

class StatsRepo:
    def upsert_daily(self, rows: list[VideoStatsDaily]) -> None: ...
    def daily(self, youtube_id: str, start: date, end: date) -> list[VideoStatsDaily]: ...
    def last_day(self) -> date | None: ...

class SettingsRepo:
    def get(self, key: str) -> str | None: ...
    def set(self, key: str, value: str) -> None: ...
```

```python
# beat_server/app.py
def create_app(workspace: Workspace, settings: ServerSettings) -> FastAPI: ...
# mounts /api routers (later slices), /  -> web/dist static, lifespan starts worker + scheduler

# beat_upload/cli.py
@app.command()
def serve(port: int = 8765, open_browser: bool = False) -> None: ...   # uvicorn.run(create_app(...))
```

### Call stack

```
beat-upload serve
└─ create_app(Workspace.default(), ServerSettings())
   ├─ make_engine(ws.db_file) + alembic upgrade head
   ├─ include routers (slices 2-6)
   └─ lifespan: Worker.start(), Scheduler.start()       slice 4/6
```

### Test shape

```
tests/test_workspace.py
├─ default() uses platformdirs, beat_dir(id) is under data_dir
└─ auth.get_valid_credentials(ws) with missing token → AuthError (uses tmp_path ws)
tests/server/test_repo.py
├─ BeatRepo add/get/list ordering
└─ JobRepo next_queued returns oldest queued, skips running
```

**Done when:** `beat-upload serve` boots, `GET /api/health` returns 200, existing CLI tests pass
with the Workspace-taking auth.

---

## Slice 2: Library and YouTube sync

**Write-set:** `beat_server/api/{__init__,schemas,beats}.py` NEW, `beat_server/services/sync.py` NEW,
`tests/server/test_sync.py` NEW.
**Depends on:** slice 1.

### Signatures

```python
# beat_server/services/sync.py
def sync_library(session: Session, creds: Credentials, *, log: Callable[[str], None]) -> SyncResult:
    """Pull every upload of the channel; upsert Beats by youtube_id; refresh views/likes."""
    ...

@dataclass(frozen=True)
class SyncResult: created: int; updated: int

def merge_from_youtube(beat: Beat | None, video: VideoStats) -> Beat:
    """Pure. New Beat if None, else overwrite metadata + counters. Never touches local file paths."""
    ...
def status_from_privacy(privacy: str) -> BeatStatus: ...   # public → PUBLISHED, else UPLOADED
```

```python
# beat_server/api/schemas.py  (pydantic; this is the OpenAPI the frontend is generated from)
class BeatOut(BaseModel):
    id: str; status: BeatStatus; title: str; description: str; tags: list[str]
    category_id: int; privacy: PrivacyStatus
    youtube_id: str | None; youtube_url: str | None; published_at: datetime | None
    views: int; likes: int; comments: int
    has_files: bool; cover_url: str | None; synced_at: datetime | None

class BeatPatch(BaseModel):     # slice 5, declared here so the schema file is one place
    title: str | None = None; description: str | None = None
    tags: list[str] | None = None; privacy: PrivacyStatus | None = None

# beat_server/api/beats.py
GET  /api/beats                      -> list[BeatOut]
GET  /api/beats/{id}                 -> BeatOut
GET  /api/beats/{id}/cover           -> image file (FileResponse) — local cover or 404
POST /api/sync                       -> JobOut   (enqueue SYNC job; slice 4 runs it)
```

Validation reuse: `BeatPatch` → `YouTubeMetadata.from_mapping` is the single validator for
title length, tag types, etc. The API does not duplicate those limits.

### Call stack

```
SYNC job (worker)
└─ sync_library(session, creds, log)
   ├─ YouTubeStats(creds).videos()                     existing
   └─ for each: merge_from_youtube(repo.by_youtube_id(v.id), v) → repo.save
```

### Test shape

```
tests/server/test_sync.py
├─ merge_from_youtube(None, video) → new Beat, status by privacy, counters copied
├─ merge_from_youtube(existing_with_files, video) keeps audio/image/video paths
└─ sync_library with fake YouTubeStats: 2 new + 1 updated → SyncResult(2, 1)
```

**Done when:** after `POST /api/sync` and the job finishing, `GET /api/beats` lists all 67
channel videos with views.

---

## Slice 3: Google connection from the browser

**Write-set:** `beat_server/api/auth.py` NEW, `beat_server/api/settings.py` NEW,
`beat_upload/auth.py` EDIT (web flow helpers), `tests/test_auth_web.py` NEW.
**Depends on:** slice 1.

### Signatures

```python
# beat_upload/auth.py  (additions)
REDIRECT_PATH = "/api/auth/google/callback"

def web_flow(ws: Workspace, redirect_uri: str) -> Flow: ...          # google_auth_oauthlib Flow
def authorization_url(ws: Workspace, redirect_uri: str) -> tuple[str, str]: ...  # (url, state)
def finish_web_flow(ws: Workspace, redirect_uri: str, state: str, response_url: str) -> Credentials: ...

class AuthStatus(StrEnum): NOT_CONFIGURED = ...; NOT_CONNECTED = ...; CONNECTED = ...; EXPIRED = ...
def auth_status(ws: Workspace) -> AuthStatus: ...   # no secrets / no token / valid / refresh failed
```

```python
# beat_server/api/auth.py
GET  /api/auth/status                -> {status: AuthStatus, channel: ChannelOut | None}
GET  /api/auth/google/start          -> 307 to Google (state kept in a signed cookie)
GET  /api/auth/google/callback       -> 302 to /settings?connected=1
POST /api/auth/disconnect            -> 204  (deletes token)

# beat_server/api/settings.py
GET  /api/settings                   -> SettingsOut {google_client_id: str | None, stats_hour: int, port: int}
PUT  /api/settings/google            -> 204  body {client_id, client_secret}   (secret write-only)
```

Failure that shapes the interface: `get_valid_credentials` raising `AuthError` inside a job
must **pause** the job (status PAUSED, error = message), not fail it; `/api/auth/status`
returns EXPIRED; reconnecting resumes paused jobs (slice 4 `Worker.resume_paused()`).

### Test shape

```
tests/test_auth_web.py
├─ auth_status: no secrets → NOT_CONFIGURED; secrets, no token → NOT_CONNECTED
├─ authorization_url contains redirect_uri and requested scopes
└─ (server) GET /api/auth/google/start without secrets → 409 with actionable message
```

**Done when:** from Settings you paste client id/secret, click Connect, land back on Settings
with status CONNECTED and the channel title shown.

---

## Slice 4: Jobs, worker, live events

**Write-set:** `beat_server/jobs/{__init__,queue,worker,events,handlers}.py` NEW,
`beat_server/api/{jobs,events}.py` NEW, `tests/server/test_worker.py` NEW.
**Depends on:** slice 1.

### Signatures

```python
# beat_server/jobs/events.py
@dataclass(frozen=True)
class Event: type: Literal["job", "beat"]; payload: dict[str, Any]

class EventBus:
    def publish(self, event: Event) -> None: ...
    async def subscribe(self) -> AsyncIterator[Event]: ...   # one asyncio.Queue per subscriber

# beat_server/jobs/queue.py
class JobQueue:
    def __init__(self, session_factory, bus: EventBus): ...
    def enqueue(self, kind: JobKind, beat_id: str | None = None) -> Job: ...
    def recover(self) -> int: ...          # RUNNING → QUEUED at startup; returns count
    def resume_paused(self) -> int: ...    # PAUSED → QUEUED after reconnect

# beat_server/jobs/worker.py
class JobContext:
    job: Job; session: Session; workspace: Workspace
    def progress(self, fraction: float, message: str = "") -> None: ...   # saves + publishes
    def log(self, line: str) -> None: ...
    def credentials(self) -> Credentials: ...   # raises AuthError → worker pauses the job

JobHandler = Callable[[JobContext], Awaitable[None]]

class Worker:
    def __init__(self, queue: JobQueue, handlers: Mapping[JobKind, JobHandler]): ...
    async def run_forever(self) -> None: ...   # one job at a time
    async def run_one(self, job: Job) -> None: ...
    # AuthError   → PAUSED;  BeatUploadError → FAILED with message;  anything else → FAILED + logged traceback

# beat_server/jobs/handlers.py — registry only; bodies call services
HANDLERS: dict[JobKind, JobHandler] = {JobKind.SYNC: run_sync, JobKind.RENDER: run_render, ...}
```

```python
# beat_server/api/jobs.py
class JobOut(BaseModel): id; beat_id; kind; status; progress; message; error; created_at; started_at; finished_at
GET /api/jobs?beat_id=&limit=        -> list[JobOut]
GET /api/jobs/{id}                   -> JobOut
POST /api/jobs/{id}/retry            -> JobOut   (FAILED → new job of same kind)

# beat_server/api/events.py
GET /api/events                      -> text/event-stream of Event (job progress, beat status changes)
```

### Test shape

```
tests/server/test_worker.py
├─ handler raising AuthError → job PAUSED, beat status unchanged
├─ handler raising VideoError → job FAILED with message, no traceback in error
├─ progress() updates row and publishes an Event to a subscriber
└─ recover() flips RUNNING → QUEUED
```

**Done when:** `POST /api/sync` → `/api/events` streams job progress → job DONE.

---

## Slice 5: New Beat: files → metadata → render → upload

**Write-set:** `beat_server/services/beats.py` NEW, `beat_server/services/pipeline.py` NEW,
`beat_server/api/beats.py` EDIT, `beat_upload/video.py` EDIT, `beat_upload/youtube.py` EDIT,
`beat_upload/beat_folder.py` EDIT (extension constants reused), `tests/test_video.py`, `tests/server/test_pipeline.py`.
**Depends on:** slices 3, 4.

### Signatures

```python
# beat_upload/video.py  — progress added; behaviour otherwise unchanged
ProgressFn = Callable[[float], None]      # 0..1
def probe_duration(audio: Path) -> float: ...        # ffprobe
def render_video(audio: Path, image: Path, output: Path, on_progress: ProgressFn | None = None) -> Path: ...
# implementation note: ffmpeg -progress pipe:1, parse out_time_us / duration

# beat_upload/youtube.py — chunked resumable upload with progress
def upload_video(video: Path, metadata: YouTubeMetadata, credentials: Credentials,
                 on_progress: ProgressFn | None = None) -> str: ...
# chunksize=8 MiB, loop next_chunk(); CLI passes None and behaves as today

# beat_server/services/beats.py
def create_draft(ws: Workspace, repo: BeatRepo, audio: UploadFile, image: UploadFile) -> Beat: ...
# validates extensions via beat_folder.AUDIO_EXTENSIONS / IMAGE_EXTENSIONS; stores under ws.beat_dir(id)
def apply_patch(beat: Beat, patch: BeatPatch) -> Beat: ...     # via YouTubeMetadata.from_mapping
def metadata_of(beat: Beat) -> YouTubeMetadata: ...
def default_metadata(settings: SettingsRepo) -> dict: ...    # title/description/tags template (from Settings)

# beat_server/services/pipeline.py  — the two handlers
async def run_render(ctx: JobContext) -> None: ...   # DRAFT/QUEUED → RENDERING → (enqueue UPLOAD)
async def run_upload(ctx: JobContext) -> None: ...   # → UPLOADING → UPLOADED/PUBLISHED, sets youtube_id
```

```python
# beat_server/api/beats.py  (additions)
POST   /api/beats                    multipart {audio, image}      -> BeatOut (status DRAFT)
PATCH  /api/beats/{id}               BeatPatch                     -> BeatOut   (DRAFT/QUEUED only, else 409)
POST   /api/beats/{id}/upload        -> JobOut   (enqueue RENDER; RENDER enqueues UPLOAD on success)
POST   /api/beats/{id}/privacy       {privacy}  -> BeatOut   (existing set_privacy; any uploaded beat)
DELETE /api/beats/{id}               -> 204   (DRAFT only; removes files. Uploaded beats are not deleted here)
```

### Call stack

```
POST /api/beats/{id}/upload
└─ queue.enqueue(RENDER, id)
   └─ worker → run_render(ctx)
      ├─ beat.status = RENDERING
      ├─ render_video(audio, image, video, ctx.progress)      existing + progress
      └─ queue.enqueue(UPLOAD, id)
         └─ worker → run_upload(ctx)
            ├─ ctx.credentials()                                 AuthError → PAUSED
            ├─ upload_video(video, metadata_of(beat), creds, ctx.progress)
            └─ beat.youtube_id = ...; status = PUBLISHED if privacy == public else UPLOADED
```

### Test shape

```
tests/test_video.py
└─ parse_ffmpeg_progress(lines, duration) → fractions (pure helper)
tests/server/test_pipeline.py
├─ create_draft rejects two audio files / unknown extension with BeatFolderError
├─ apply_patch with title > 100 → ConfigError → 422 at the API
├─ run_render with fake render → status RENDERING then UPLOAD job enqueued
└─ run_upload with fake upload_video → youtube_id set, status by privacy
```

**Done when:** drop mp3+png in the UI, edit title, click Upload, watch progress to 100%, get a
youtu.be link.

---

## Slice 6: Stats history and scheduler

**Write-set:** `beat_server/services/stats.py` NEW, `beat_server/jobs/scheduler.py` NEW,
`beat_server/api/stats.py` NEW, `tests/server/test_stats.py` NEW.
**Depends on:** slices 2, 4.

### Signatures

```python
# beat_server/services/stats.py
def collect_day(session: Session, creds: Credentials, day: date) -> int:
    """One Analytics call (dimensions=video, start=end=day) → upsert rows. Returns row count."""
    ...
def missing_days(last: date | None, today: date, *, backfill_days: int = 90) -> list[date]: ...   # pure
async def run_stats(ctx: JobContext) -> None: ...   # collect every missing day up to yesterday, also refresh snapshots via sync

# beat_server/jobs/scheduler.py
class Scheduler:
    def __init__(self, queue: JobQueue, settings: SettingsRepo): ...
    async def run_forever(self) -> None: ...   # every minute: if now >= next_due and no STATS job today → enqueue
    def next_due(self, now: datetime) -> datetime: ...   # daily at stats_hour (default 04:00 local)

# beat_server/api/stats.py
class DayPoint(BaseModel): day: date; views: int; watch_minutes: int; avg_view_seconds: int; avg_view_percent: float
GET /api/beats/{id}/stats?days=28    -> list[DayPoint]   (empty list if no youtube_id)
GET /api/stats/overview?days=28      -> {views: int, watch_minutes: int, per_day: list[DayPoint]}
```

### Test shape

```
tests/server/test_stats.py
├─ missing_days(None, today) → 90 days ending yesterday; missing_days(yesterday, today) → []
├─ collect_day with fake analytics → rows upserted, re-run is idempotent
└─ Scheduler.next_due: laptop asleep past due → due now, not tomorrow
```

**Done when:** after first run the Beat page shows a 28-day views chart for an old video.

---

## Slice 7: Frontend

**Write-set:** `web/` NEW (whole tree), `beat_server/app.py` EDIT (static mount).
**Depends on:** slices 2, 3, 4 for real data; scaffolding can start against the OpenAPI JSON of slice 1-2.

### File placement

```
web/
├── package.json  vite.config.ts  tsconfig.json  components.json (shadcn)
├── src/
│   ├── main.tsx  App.tsx  router.tsx
│   ├── styles/
│   │   ├── tokens.css          ALL colours/spacing/radii/fonts as CSS vars; the redesign surface
│   │   └── globals.css         tailwind + base
│   ├── api/
│   │   ├── schema.d.ts         GENERATED: openapi-typescript from /openapi.json (npm run api)
│   │   ├── client.ts           openapi-fetch instance
│   │   ├── queries.ts          TanStack hooks: useBeats, useBeat, useJobs, useAuthStatus, useSettings
│   │   └── events.ts           useEvents(): SSE → invalidates queries / patches cache
│   ├── components/ui/          shadcn (button, card, input, badge, progress, dialog, toast)
│   ├── components/
│   │   ├── AppShell.tsx        nav + AuthBanner slot
│   │   └── AuthBanner.tsx      EXPIRED / NOT_CONNECTED → link to Settings
│   └── features/
│       ├── library/  LibraryPage.tsx  BeatCard.tsx  BeatGrid.tsx  DropZone.tsx
│       ├── beat/     BeatPage.tsx  MetadataForm.tsx  JobList.tsx  JobStatus.tsx  ViewsChart.tsx
│       └── settings/ SettingsPage.tsx  GoogleForm.tsx  ScheduleForm.tsx
└── dist/                       built; served by FastAPI at /
```

### Signatures (component contracts)

```ts
// features/library
function BeatCard({ beat }: { beat: BeatOut }): JSX.Element            // cover, title, status Badge, views; link to /beats/:id
function DropZone({ onFiles }: { onFiles: (audio: File, image: File) => void }): JSX.Element
// features/beat
function MetadataForm({ beat, onSave }: { beat: BeatOut; onSave: (p: BeatPatch) => Promise<void> }): JSX.Element
function JobStatus({ job }: { job: JobOut }): JSX.Element               // progress bar + message/error + retry
function ViewsChart({ points }: { points: DayPoint[] }): JSX.Element    // recharts line
// api
function useEvents(): void   // subscribes once in AppShell; on "job" → setQueryData(['jobs']), on "beat" → invalidate(['beats'])
```

Routes: `/` Library, `/beats/:id` Beat, `/settings` Settings.

Rules (from web-v1.md): no hex outside `tokens.css`, no inline styles, one component per
domain thing. `npm run api` regenerates `schema.d.ts`; CI fails if it is stale.

### Test shape

```
web/src/features/library/BeatCard.test.tsx      (vitest + testing-library)
├─ renders title, formatted views, status badge
web/src/api/events.test.ts
└─ "job" event patches the jobs cache without refetch
```

**Done when:** all three screens work against the running server; `npm run build` output is
served by `beat-upload serve`.

---

## Slice 8: Run always

**Write-set:** `deploy/beat-upload.service` NEW, `beat_upload/cli.py` EDIT (`install-service`),
README EDIT.
**Depends on:** slice 1.

```python
@app.command()
def install_service() -> None: ...   # writes ~/.config/systemd/user/beat-upload.service, prints the enable command
```

Unit: `ExecStart=<venv>/bin/beat-upload serve`, `Restart=on-failure`, `WantedBy=default.target`.

**Done when:** after reboot, `http://localhost:8765` opens the Library without touching a terminal.

---

## Slice graph

```
1 ── 2 ──┬── 6
   ├─ 3 ─┤
   ├─ 4 ─┴── 5
   ├─ 7 (after 2,3,4 APIs exist)
   └─ 8
```

Parallelisable after slice 1: {2, 3, 4, 8}. Then {5, 6, 7}.

## Open questions

None blocking. Two defaults I chose without asking; say if wrong:

- Data dir `~/.local/share/beat-upload/` for sqlite and beat files (config dir keeps only secrets/token).
- Stats backfill: 90 days on first run, one Analytics request per day.
