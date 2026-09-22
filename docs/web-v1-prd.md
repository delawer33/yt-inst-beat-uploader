# PRD: Web UI v1

Glossary: [CONTEXT.md](../CONTEXT.md). Decisions: [ADR 0001](adr/0001-local-first-web-app-with-cloud-shaped-api.md), [ADR 0002](adr/0002-core-package-stays-web-and-db-free.md). Program design: [web-v1-design.md](web-v1-design.md).

## Problem Statement

Publishing a beat today means: make a folder, hand-edit a YAML file, run a CLI command, wait
in a terminal for ffmpeg and the upload, then run other commands to see how the channel is
doing. There is no single place that shows every Beat, what state it is in, and how it performs
over time. The Analytics API only returns a window, so "which beat started growing last week"
cannot be answered at all. The OAuth token also expires every week, and the first sign of it is a
failed command.

## Solution

A local web application that runs on the owner's laptop from boot. It shows the whole Library
(both Beats added here and videos already on the channel), lets the owner drop an audio file and
a cover to create a Beat, edit its Metadata in a form, and click Upload. Render and Upload run in
the background with live progress; the browser tab can be closed. Every night the app records
per-day statistics for every video so each Beat page shows a views chart. Google is connected
with one button in Settings, and an expired connection is a banner, not a crash.

## User Stories

1. As a channel owner, I want the app to start with my laptop and be reachable at a fixed local address, so that I never open a terminal to use it.
2. As a channel owner, I want to see every video on my channel in the Library the first time I open the app, so that old uploads and new Beats live in one place.
3. As a channel owner, I want each Library card to show cover, title, status and views, so that I can scan the channel at a glance.
4. As a channel owner, I want to drop one audio file and one image onto the Library to create a Beat, so that adding a beat takes seconds.
5. As a channel owner, I want the app to refuse a drop that is not exactly one audio and one image, with a message that says what is wrong, so that I fix it immediately.
6. As a channel owner, I want a new Beat pre-filled with my title/description/tags template, so that I only change the beat name, BPM and key.
7. As a channel owner, I want to edit title, description, tags and privacy in a form with YouTube's limits enforced, so that the upload never fails on validation.
8. As a channel owner, I want one Upload button that renders the video and uploads it, so that I do not run two steps.
9. As a channel owner, I want to see render and upload progress live, so that I know the job is alive.
10. As a channel owner, I want to close the tab during a job and come back later to its result, so that the laptop, not the browser, owns the work.
11. As a channel owner, I want a failed Job to show the reason and a Retry button, so that a transient error does not mean starting over.
12. As a channel owner, I want a Job that fails because Google access expired to pause rather than fail, and to resume after I reconnect, so that a weekly token expiry costs one click.
13. As a channel owner, I want a banner whenever Google is not connected or has expired, so that I learn it before a job needs it.
14. As a channel owner, I want to paste my Google client id and secret in Settings and click Connect, so that authorising never involves a terminal.
15. As a channel owner, I want the channel name shown in Settings once connected, so that I know which account is linked.
16. As a channel owner, I want to disconnect Google from Settings, so that I can switch accounts.
17. As a channel owner, I want to change the privacy of any uploaded video from its Beat page, so that I can unlist or publish without YouTube Studio.
18. As a channel owner, I want the Beat page of an uploaded video to link to it on YouTube, so that I can open it in one click.
19. As a channel owner, I want the Library to refresh from YouTube on demand, so that changes made in YouTube Studio appear here.
20. As a channel owner, I want per-day views, watch time and average view duration recorded every night for every video, so that history accumulates without me doing anything.
21. As a channel owner, I want the first run to backfill the last 90 days of statistics, so that the charts are not empty on day one.
22. As a channel owner, I want a views-per-day chart on every Beat page, so that I can see which beat is growing.
23. As a channel owner, I want a channel-wide views-per-day overview, so that I can see the trend of the whole channel.
24. As a channel owner, I want the nightly collection to catch up when the laptop was asleep at the scheduled hour, so that no day is lost.
25. As a channel owner, I want to set the hour of the nightly collection, so that it runs when the laptop is on.
26. As a channel owner, I want a Job log on the Beat page, so that I can see what happened to it and when.
27. As a channel owner, I want to delete a draft Beat and its files, so that mistakes do not pile up.
28. As a channel owner, I want the app to keep working when the laptop reboots mid-job, so that an interrupted render restarts on its own.
29. As a channel owner, I want the CLI to keep working exactly as before, so that scripted analysis is unaffected.
30. As a developer, I want the frontend to talk to the backend only over a typed HTTP API, so that the same UI can later run against a hosted server or inside a desktop bundle.
31. As a developer, I want every colour, spacing and font defined in one tokens file, so that a redesign does not touch feature code.
32. As a developer, I want the API client generated from the server's OpenAPI schema, so that types cannot drift.
33. As a developer, I want the core package to stay free of web and database code, so that it stays testable from a plain script.

## Implementation Decisions

- **Shape.** Local FastAPI service on a fixed port (8765), started by a `serve` CLI command and installed as a systemd user unit. Serves the built frontend as static files. See ADR 0001.
- **Workspace.** A new core concept holding the paths of one channel owner's data: config dir for client secrets and token, data dir for the SQLite database and Beat files. Auth functions take a Workspace explicitly instead of module-level constants. Only one Workspace exists today.
- **Layering.** Core package (rendering, YouTube calls, auth, validation) has no web or DB imports. Server package holds API routes, SQLite access, the job queue, the scheduler and services. CLI and server are two consumers of the core. See ADR 0002.
- **Persistence.** SQLite via SQLAlchemy 2.0 with Alembic migrations. Tables: Beat, Job, per-video-per-day statistics, key/value settings.
- **Beat lifecycle.** `draft → queued → rendering → uploading → uploaded → published`. Local files are optional: Beats pulled from YouTube have none and cannot be rendered, but support privacy changes and statistics.
- **Source of truth.** For uploaded/published Beats YouTube is the truth; sync overwrites local Metadata and counters but never local file paths. Until upload, local is the truth. Metadata of already uploaded videos is not editable in the UI in v1.
- **Validation.** The existing `YouTubeMetadata` validator is the single place where YouTube limits live; the API's patch endpoint delegates to it.
- **Jobs.** Kinds: render, upload, sync, stats. One in-process asyncio worker, one Job at a time. Render enqueues upload on success. On startup, running Jobs return to queued. Auth failure inside a Job sets it to paused; reconnecting requeues paused Jobs. Domain errors set failed with the message; unexpected exceptions set failed and log the traceback.
- **Progress.** Render progress parsed from ffmpeg's machine-readable progress output; upload progress from resumable chunked upload. Both core functions accept an optional progress callback; the CLI passes none.
- **Live updates.** One Server-Sent Events endpoint publishes Job progress and Beat status changes. The frontend patches its query cache from events; no polling.
- **Google connection.** Standard web OAuth flow against the app's own callback URL; client id/secret entered in Settings (secret write-only). Bundling a secret into a distributable is rejected. Auth status is one of: not configured, not connected, connected, expired.
- **Statistics.** Nightly Job collects the previous day with one Analytics API request per day (grouped by video). First run backfills 90 days. Scheduler runs daily at a configurable hour and catches up if the due time was missed.
- **API surface.** Beats (list, get, create from files, patch, upload, privacy, delete draft, cover image, per-beat stats), Jobs (list, get, retry), Sync (trigger), Auth (status, start, callback, disconnect), Settings (get, set Google credentials), Stats overview, Events stream.
- **Frontend.** Vite + React + TypeScript, Tailwind + shadcn/ui, TanStack Query, react-router. Three routes: Library, Beat, Settings. Dark theme only. Design tokens in one CSS file; no hex codes or inline styles in feature code; one component per domain thing. API types generated from OpenAPI; a stale generated file fails CI.

## Testing Decisions

A good test exercises behaviour through a module's public interface with fakes at the network
and process boundary, and never asserts on internals. No test touches the network, ffmpeg, the
real config directory or a real browser; use temporary directories and in-memory SQLite.

Tested modules:

- Workspace and auth status (core).
- Sync merge rules (pure) and the sync service with a fake YouTube client.
- Worker semantics: pause on auth error, fail with message on domain error, recovery on startup, progress events reaching a subscriber.
- Pipeline: draft creation validation, patch validation via the shared validator, render→upload chaining with fake render/upload.
- Statistics: missing-day computation, idempotent collection, scheduler catch-up.
- ffmpeg progress parsing (pure).
- Frontend: BeatCard rendering and the SSE-to-cache handler, with vitest and testing-library.

Prior art: `tests/test_config.py`, `tests/test_stats.py`, `tests/test_analytics.py` — pure
parsers exercised on canned API responses; `tests/test_beat_folder.py` — filesystem rules on
`tmp_path`.

## Out of Scope

Scheduled publishing; editing Metadata of already uploaded videos (two-way sync); importing a
legacy Beat Folder; light theme; the final visual design (done later on top of the token layer);
desktop bundling (Tauri); multiple Workspaces or hosted multi-tenant operation; Instagram.

## Further Notes

Data API quota is 10 000 units/day; sync costs a few units per 50 videos, an upload 1600.
Analytics quota is separate. While the Google consent screen stays in Testing status the token
expires weekly; the paused-Job behaviour exists for exactly that.
