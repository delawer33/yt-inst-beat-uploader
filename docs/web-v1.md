# Web UI, version 1 — decisions from the 2026-09-22 grilling

Terms: see [CONTEXT.md](../CONTEXT.md). Why: see [ADR 0001](adr/0001-local-first-web-app-with-cloud-shaped-api.md), [ADR 0002](adr/0002-core-package-stays-web-and-db-free.md).

## Shape

- Local service on the laptop, starts with the system (systemd user unit), fixed port 8765.
- Backend: FastAPI + SQLite. In-process asyncio worker, one Job at a time. `running` Jobs
  roll back to `queued` on restart; the scheduler catches up missed runs on start.
- Progress to the browser over SSE (`/api/events`).
- Frontend: React + TypeScript + Vite, Tailwind + shadcn/ui, dark theme. API client generated
  from the OpenAPI schema. Built static is served by FastAPI.
- CLI stays a full consumer of the core package.

## Data

- A Beat is a row in SQLite with a lifecycle: draft → queued → rendering → uploading →
  uploaded → published. Local files are optional (Beats pulled from YouTube have none).
- For published Beats YouTube is the source of truth; the nightly sync overwrites local
  metadata. Until published, local is the truth.
- Editing metadata of an already uploaded video from the UI is out of v1 (two-way sync).
- Nightly stats refresh appends a per-day row per video (views, watch time, AVD).

## Screens

1. Library — grid of Beat cards (cover, title, status, views), a New beat button.
   New beat (`/beats/new`) — two file slots (audio, cover) that can be filled from different folders.
2. Beat — metadata form, Job log with progress, per-day views chart.
3. Settings — Google client id/secret, "Connect YouTube", working folder, schedule.

Expired token shows as a banner; background Jobs pause instead of failing.

## Design

Simple now, real design later in parallel. To make that cheap: all colours, spacing, radii and
fonts are CSS variables in one `tokens.css`; features use only Tailwind classes bound to those
tokens; no inline styles, no hex codes outside `tokens.css`; one component per domain thing
(`BeatCard`, `JobStatus`, `FileSlot`).

## Code layout

```
beat_upload/        core: beat_folder, config, video, youtube, stats, analytics, auth, errors,
                    workspace (new)
server/api          FastAPI routes, pydantic schemas, SSE
server/db           SQLite, migrations, repositories
server/jobs         queue, worker, scheduler
server/main.py      wires it up, serves web/dist
web/                Vite app: api/ (generated), features/{beats,stats,settings}, components/ui
```

## Deferred

Scheduled publishing, import from a Beat Folder, light theme, Tauri bundle, multi-Workspace.
