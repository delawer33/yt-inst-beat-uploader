# CLAUDE.md

Beat Upload turns a beat (audio + cover image) into a 1080p video with ffmpeg, uploads it to
YouTube via the Data API v3 and tracks how the channel performs. Two front doors: the
`beat-upload` CLI and a local web app (`beat-upload serve`: FastAPI + React). Instagram is in
the repo name but was never implemented; out of scope unless asked.

Glossary: `CONTEXT.md`. Decisions: `docs/adr/`. Use the glossary's words in code, docs and UI.

## Commands

```bash
source .venv/bin/activate
pip install -e '.[dev]'          # installs the `beat-upload` console command
ruff check . && ruff format .    # lint + format (config in pyproject.toml)
pytest                           # python tests: core + server, no network, no ffmpeg
pytest tests/server/test_pipeline.py -k render   # single test
beat-upload login --client-id ID --client-secret SECRET
beat-upload upload test_data     # CLI upload of a Beat Folder, needs a valid token
beat-upload videos --json        # all uploads with views/likes; also channel, video ID
beat-upload analytics -d 28      # per-video views, watch time, AVD (Analytics API)
beat-upload serve --open-browser # web UI + API on http://127.0.0.1:8765

cd web
npm run dev                      # Vite on :5173, proxies /api to :8765 (or preview "web-dev")
npm test                         # vitest
npm run build                    # -> web/dist, served by `serve`
npm run lint:tokens              # no colours, radii or fonts outside design/ds/
PYTHON=../.venv/bin/python npm run api   # regenerate src/api/schema.d.ts from OpenAPI
```

`python main.py ...` equals `beat-upload ...`.

## Layout

```
beat_upload/            core, no web and no DB (ADR 0002)
  cli.py                Typer commands only; catches BeatUploadError and prints it
  beat_folder.py        the one audio + one image rule; every beat-folder constant
  config.py             config.yaml -> YouTubeMetadata; every YouTube limit
  video.py              render_video(): the ffmpeg command
  youtube.py            upload_video(), set_privacy()
  stats.py, analytics.py   Data API / Analytics API reads; parse_* are pure
  auth.py, workspace.py    OAuth files and data dir of one channel owner (platformdirs)
beat_server/            FastAPI app for `serve`
  api/                  routers + pydantic schemas (the OpenAPI the frontend is generated from)
  db/                   SQLAlchemy models, repos, alembic migrations (packaged)
  jobs/                 queue, worker, scheduler, SSE event bus
  services/             sync, pipeline (render -> upload), stats
web/src/                React 19 + TS, TanStack Query, react-router
  api/                  generated schema.d.ts + openapi-fetch client; never hand-write types
  components/           AppShell (sidebar, banner), shared pieces
  features/<domain>/    library, beat, new-beat, jobs, settings, stats; hooks in queries.ts
design/ds/              mirror of the Design System (see below); linked by the frontend
docs/                   PRD, design and manifest of past work; docs/adr/ decisions
tests/                  pytest; tests/server/ for beat_server
test_data/, dev/        gitignored / untracked: real beat folder, banners, transcripts
```

Web flow (ADR 0004):

```
drop audio + cover -> Draft, Render Job starts at once
-> owner edits Metadata on the Beat page while it renders
-> "Save & upload when rendered" -> Queued -> Upload -> Uploaded / Scheduled / Published
```

A Beat's status is what the owner did; a Job is what is happening now. `rendering` is not a
Beat status.

## Design

The look lives in the Claude Design project **Beat Upload** (design system,
`166cce5a-06a3-489b-824d-031ba1f90d1b`). `design/ds/` is its mirror in the repo and the
frontend links `design/ds/styles.css` directly. Screens are drawn in the project **Beat
Upload UI mockups** (`68b7877c-e58e-465a-a16c-ac6026847cd3`, file `Beat Upload.dc.html`).
Both are read and written with the `DesignSync` tool. ADR 0005 has the why.

- Before any task that touches the look: pull the Design System, diff it against
  `design/ds/`, show the user what differs.
- A visual change made here goes into `design/ds/styles.css`, `readme.md` and the component
  page, and is pushed to the Design System in the same task. Never a local stylesheet in
  `web/`; Tailwind is layout glue only (flex, grid, gap), never colour, radius or type.
  `web/src/styles/globals.css` is the Tailwind entry point and holds nothing else.
- Cascade: `design/ds/styles.css` is imported unlayered, Tailwind utilities live in
  `@layer utilities`, so a DS class silently beats a utility on the same property at any
  specificity. A DS class owns every property it sets; Tailwind may only add others.
- New page or element: the user chooses per task. **Code first** for small things (a variant,
  a column, a state): build it from existing classes, add what is missing to the Design
  System. **Design first** for a new page or interaction (a calendar, a Jobs page): the user
  draws it in the mockups project, then you read the Mockup and build it from the classes.
- Whether a code-first screen also gets a Mockup is the user's call; do not add one unasked.
- A screen is built only from the blocks the API has data for. Leave the rest out, no
  placeholders, and tell the user what was dropped.
- Mockups exist for screens the app has no feature for (Jobs page, bulk select, Trending,
  side panel). Do not build those until the feature is asked for.

## Conventions

- Expected failures raise a `BeatUploadError` subclass with a message a user can act on.
  Never catch `Exception` broadly; never `print` outside `cli.py`.
- `pathlib.Path` everywhere, no `os.path`. Python 3.13, `StrEnum`, `X | None`.
- New metadata field: `YouTubeMetadata` + `from_mapping` validation + `youtube.py` +
  `tests/test_config.py` + README; for the web also `api/schemas.py`, `npm run api`, the form.
- Tests must not touch the network, ffmpeg or the real config dir. Use `tmp_path`.
- Analysing the channel: run `beat-upload videos --json` and reason over the output. Do not
  add aggregate commands. Data API quota 10 000 units/day; a read is 1, an upload 1600.

## Do not commit

`token.json`, `client_secrets.json`, `yt-secrets.json`, `session-*.md`, `test_data/`, `dev/`.
The stray copies in the repo root are leftovers and unused by the code.

## Known state

- OAuth token gets revoked every 7 days while the Cloud Console consent screen is in
  "Testing". Publishing the app to "Production" fixes it. Otherwise reconnect in Settings.
- CLI: `video.mp4` is never re-rendered; delete it to pick up a changed audio or image.
- `requirements.txt` duplicates `pyproject.toml` dependencies for `pip install -r` users.
