# Scheduled publishing — orchestration manifest

Mode: fast. Push: no (local main only). Base: main @ 7be8fa6 (docs commit on branch claude/delayed-grill-with-docs-post-0d1ae9, to be merged).

| Ticket | Status | Branch / worktree | Write-set | Done condition | Retries |
|---|---|---|---|---|---|
| #9 schedule on draft, upload as Scheduled | todo | — | tbd (scout) | `pytest -q && cd web && npm run typecheck && npm test` | 0 |
| #10 sync recognises Scheduled, catch-up | todo | — | tbd | `pytest -q` | 0 |
| #11 reschedule / cancel / publish now | todo | — | tbd | `pytest -q && cd web && npm run typecheck && npm test` | 0 |

Waves: 1 = #9. 2 = #10 ∥ #11 (after #9 merged into integration branch).

## Decisions
- Committed CONTEXT.md + ADR 0003 as 7be8fa6 before starting; tickets reference them.

## Log
