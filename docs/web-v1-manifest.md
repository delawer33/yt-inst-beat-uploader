# Orchestration manifest: Web UI v1

Mode: fast. Push: no (local main only). Started 2026-09-22.
Base commit: 3aba73b (WIP commit of the uncommitted package layout; `dev/` left untracked).
Worktrees: ../yt-inst-beat-uploader-wt/sN, branches slice-N-*.
Shared venv: main checkout `.venv` (server deps preinstalled). Subagents must use PYTHONPATH=<worktree>.

## Waves (from design slice graph + ticket blockers)

- W1: #8 (slice 1 foundation + web scaffold)
- W2: #2 (auth, slice 3), #3 (jobs, slice 4), #7 (systemd, slice 8)  — parallel
- W3: #4 (library + sync, slice 2 + Library/Beat UI)
- W4: #5 (new beat pipeline, slice 5), #6 (stats + scheduler, slice 6) — parallel

## Tickets

| # | title | status | branch | done condition | retries | notes |
|---|-------|--------|--------|----------------|---------|-------|
| 8 | Foundation | ready (7a651f6, verified) | slice-1-foundation | `PYTHONPATH=wt pytest -q && ruff check . && (cd web && npm run build)` + health test | 0 | |
| 2 | Google connection | ready (merged, integration aaa5a72) | slice-2 | pytest (tests/test_auth_web.py + server) + ruff + web build | 0 | review: yes (auth) |
| 3 | Jobs/worker/SSE | ready (3db8419 fixes; merged into integration c37cd59) | slice-3 | pytest tests/server/test_worker.py + suite + ruff + web build | 0 | review: yes (seam) |
| 7 | systemd | ready (7ce46d0, verified) | slice-7 | pytest + ruff | 0 | |
| 4 | Library/sync | ready (merged, integration 26a10e0) | slice-4 | pytest tests/server/test_sync.py + suite + web build | 0 | |
| 5 | New beat pipeline | in-progress@s5 | slice-5 | pytest test_video + test_pipeline + suite + web build | 0 | |
| 6 | Stats/scheduler | ready (628cd52 verified; merged, integration 628cd52) | slice-6 | pytest tests/server/test_stats.py + suite + web build | 0 | |

## Decisions

- Committed the user's uncommitted refactor as 3aba73b so worktrees see the package; `dev/` (banners, transcripts) left untracked on purpose.
- Alembic migrations live in `beat_server/db/migrations/` (packaged) instead of a root `alembic/`, so `beat-upload serve` from an installed venv finds them; `alembic.ini` at root points there.
- Frontend: per-feature hook files instead of one `queries.ts` so W2 slices don't collide; `schema.d.ts` regenerated at integration.
- Server deps preinstalled into the shared venv to avoid concurrent pip installs from worktrees.

## Log

- W1 started: #8 → s1.
- W1 done: #8 verified (55 py tests, ruff, web build). Branch `integration` = slice-1-foundation. W2 started: #2→s2, #3→s3, #7→s7 off integration.
- Deviation accepted (#8): cli.py imports beat_server lazily inside serve(); layering test exempts cli.py. AppShell nav has 2 links.
- #7 done and verified by coordinator (63 tests, ruff clean). Waiting on #2, #3.
- #3 done, done condition verified (71 tests, 5 vitest). Review dispatched (seam). Deviations accepted: JobContext has `queue` arg + `enqueue()`; SSE uses `event:` field; /api/events excluded from OpenAPI.
- #2 done, done condition verified (75 tests, 4 vitest). Review dispatched (auth). Noted: ScheduleForm UI deferred to #6; BEAT_UPLOAD_PORT ignored by serve (out of scope, log only). Starting W2 integration merge.
- W2 integrated: `integration` = cd75386 (slices 2,3,7 merged; 99 py tests, 8 vitest, smoke boot OK).
- #3 review: 2 high (worker loop dies on DB error; per-beat jobs cache pollution), 4 med (paused retry dup, session thread-safety, SSE reconnect refetch, unbounded subscriber queues). Fix cycle 1 dispatched on slice-3. Accepted residual: cli.py→beat_server lazy import (pre-existing #8 deviation).
- W3 started: #4 → s4 off integration cd75386 (#3 fixes will be merged into integration afterwards).
- #2 review: no high; med: CSRF on disconnect/start, token/secrets file perms, OAUTHLIB_INSECURE_TRANSPORT process-wide, redirect_uri from Host header. Fix cycle 1 dispatched on slice-2 (findings 1-8). Accepted residual: access log may contain OAuth code (single-use, localhost); GoogleForm requires re-typing client id; design doc signature drift (web_flow state kwarg).
- #3 fix cycle done (all 8 findings), verified; merged → integration c37cd59 (106 py tests, 12 vitest). Note: worktree s3 now holds `integration` (used as the integration checkout). s7 removed. JobContext now takes session_factory; ctx.progress no longer commits ctx.session.
- #2 fix cycle done (findings 1-8 incl. CSRF middleware, 0600 files, no OAUTHLIB env, redirect_uri from settings, NetworkError), verified (90 tests). Merge into integration conflicted in app.py → fix agent resolving.
- #4 done, verified (112 py tests, 11 vitest). Deviations accepted: run_sync body in services/sync.py; SyncResult.beat_ids; ConflictError/BeatStateError added; BeatRepo.list ordering by coalesce(published_at, created_at). Will merge after slice-2 merge lands.
- W3 integrated: integration = 26a10e0 (134 py tests, 15 vitest, smoke boot OK: sync job pauses on missing token as designed). W4 started: #5→s5, #6→s6 off 26a10e0.
- #6 done, verified (153 py tests, 17 vitest); merged clean into integration 628cd52. Deviations accepted: next_due static with hour kwarg; missing_days caps backfill; stats windows end yesterday; recharts 3.2.1 added. Waiting on #5.
