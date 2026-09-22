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
| 8 | Foundation | in-progress@s1 | slice-1-foundation | `PYTHONPATH=wt pytest -q && ruff check . && (cd web && npm run build)` + health test | 0 | |
| 2 | Google connection | todo | | pytest (tests/test_auth_web.py + server) + ruff + web build | 0 | review: yes (auth) |
| 3 | Jobs/worker/SSE | todo | | pytest tests/server/test_worker.py + suite + ruff + web build | 0 | review: yes (seam) |
| 7 | systemd | todo | | pytest + ruff | 0 | |
| 4 | Library/sync | todo | | pytest tests/server/test_sync.py + suite + web build | 0 | |
| 5 | New beat pipeline | todo | | pytest test_video + test_pipeline + suite + web build | 0 | |
| 6 | Stats/scheduler | todo | | pytest tests/server/test_stats.py + suite + web build | 0 | |

## Decisions

- Committed the user's uncommitted refactor as 3aba73b so worktrees see the package; `dev/` (banners, transcripts) left untracked on purpose.
- Alembic migrations live in `beat_server/db/migrations/` (packaged) instead of a root `alembic/`, so `beat-upload serve` from an installed venv finds them; `alembic.ini` at root points there.
- Frontend: per-feature hook files instead of one `queries.ts` so W2 slices don't collide; `schema.d.ts` regenerated at integration.
- Server deps preinstalled into the shared venv to avoid concurrent pip installs from worktrees.

## Log

- W1 started: #8 → s1.
