# Scheduled publishing — orchestration manifest

Mode: fast. Push: no (local main only). Base: main @ 7be8fa6 (docs commit on branch claude/delayed-grill-with-docs-post-0d1ae9, to be merged).

| Ticket | Status | Branch / worktree | Write-set | Done condition | Retries |
|---|---|---|---|---|---|
| #9 schedule on draft, upload as Scheduled | merged (integration) | claude/sched-9 @ .claude/worktrees/sched-9 | config.py, youtube.py(upload), models.py, migration 0003, schemas.py(BeatOut/BeatPatch), services/beats.py, pipeline.py, sync.py(status helper), web PrivacySelect/MetadataForm/StatusBadge/BeatCard/BeatPage/format.ts, schema.d.ts regen, tests, README | `pytest -q && ruff check . && (cd web && npx tsc -b && npm test && npm run api:check)` | 0 |
| #10 sync recognises Scheduled, catch-up | in-progress@impl-10 | claude/sched-10 @ .claude/worktrees/sched-10 | stats.py, sync.py(merge), scheduler.py, repo.py, tests, README | `pytest -q` | 0 |
| #11 reschedule / cancel / publish now | in-progress@impl-11 | claude/sched-11 @ .claude/worktrees/sched-11 | youtube.py(set_privacy), schemas.py(PrivacyIn), api/beats.py, sync.py(call helper), web PrivacySelect/BeatPage/queries.ts, schema.d.ts regen, tests, README | `pytest -q && ruff check . && (cd web && npx tsc -b && npm test && npm run api:check)` | 0 |

Waves: 1 = #9. 2 = #10 ∥ #11 (after #9 merged into integration branch).

## Decisions
- Committed CONTEXT.md + ADR 0003 as 7be8fa6 before starting; tickets reference them.

## Log
- Scout: no `npm run typecheck` script; use `npx tsc -b`. venv is in main checkout; never `pip install -e` from a worktree; run pytest from worktree root. Web client generated via `npm run api` with PYTHON=main-checkout venv; schema.d.ts committed. Alembic ids hand-set, next = 0003.
- #10 ∥ #11 collide only on services/sync.py (different hunks) + README. #9 must land the publish-aware status helper `status_for(privacy, publish_at)` in sync.py with final signature.
- Wave 1 started: impl-9 on claude/sched-9.
- #9 done by impl-9 (c388126), done condition verified by orchestrator: 242 py tests, 37 web tests, tsc, api:check all green. Merged into integration branch.
- #9 deviations accepted: passed-time check lives in the shared validator (run_upload catches ConfigError → DRAFT, re-raises); `PrivacySelect` has `allowScheduled` prop (false on uploaded-beat selector, #11 flips it); `BeatPatch.publish_at` uses model_fields_set for null=clear.
- Wave 2 started: impl-10 on claude/sched-10, impl-11 on claude/sched-11, both branched from integration after #9.
