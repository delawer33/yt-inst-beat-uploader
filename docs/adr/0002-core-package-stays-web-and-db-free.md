---
status: accepted
date: 2026-09-22
---

# `beat_upload/` stays free of web and database code

The core package (`beat_upload/`: beat discovery, rendering, YouTube calls, auth) does not
import from the server, the job queue or SQLite. The FastAPI server and the Typer CLI are two
independent consumers of it.

Alternative was to make the CLI a thin HTTP client of the running server. Rejected: the CLI is
used for scripted analysis (`videos --json` piped into Claude) and must work when the server is
down or on a machine without it; and a core that can be driven from a plain script is what keeps
it testable without booting the web stack.

## Consequences

- Long-running or stateful things (queue, schedule, stats history) live in `server/`, never in
  the core.
- The frontend's API client is generated from the FastAPI OpenAPI schema; hand-written TS
  types for API shapes are not accepted.
