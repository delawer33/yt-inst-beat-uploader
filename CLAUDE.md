# CLAUDE.md

Beat Upload turns a beat (audio + cover image, or a short clip) into a 1080p video with ffmpeg
(the cover in a Cover Style with the Label), uploads it to YouTube via the Data API v3, puts it
on BeatStars, tracks how the channel performs, and renders a Reel for Instagram that may move
to the beat with an Effect (a canvas/WebGL engine in headless Chromium). Two front doors: the
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
beat-upload beatstars prepare DIR && beat-upload beatstars upload DIR/beatstars
beat-upload effect test_data/16.3.25.mp3 test_data/_.jpeg out.mp4 --seconds 10  # an Effect, outside the app
beat-upload bake --status        # the baked object loops (chain, crown, gem x5) in the data dir; `bake` makes the missing ones, ~20 min each

cd web
npm run dev                      # Vite on :5173, proxies /api to :8765 (or preview "web-dev")
npm test                         # vitest
npm run build                    # -> web/dist, served by `serve`
npm run lint:tokens              # no colours, radii or fonts outside design/ds/
PYTHON=../.venv/bin/python npm run api   # regenerate src/api/schema.d.ts from OpenAPI
```

`python main.py ...` equals `beat-upload ...`.

Local server: `beat-upload serve` runs as the user unit `beat-upload.service` on :8765 and
serves `web/dist`. Python change: `systemctl --user restart beat-upload.service`. Frontend
change (`web/src`, `design/ds`): `cd web && npm run build`, then the same restart. Neither
needs the other.

## Layout

```
beat_upload/            core, no web and no DB (ADR 0002)
  cli.py                Typer commands only; catches BeatUploadError and prints it
  beat_folder.py        the one audio + one image rule; every beat-folder constant
  bounce_folder.py      the Bounce Folder reader: files by kind (cover image or Clip), BPM/key/moods/instruments from the name
  config.py             config.yaml -> YouTubeMetadata; every YouTube limit
  video.py              render_cover() one styled frame, render_video() loops it; the 1080x1920 Reel
                        (reel_graph, render_reel) the same way; render_clip() a Clip through the same graphs
  cover_style.py        the eight Cover Styles as ffmpeg filters (seven gradient maps + ink; Film Grain, the default)
  label.py              the Label, drawn with Pillow; League Gothic ships in fonts/
  youtube.py            upload_video(), set_privacy()
  stats.py, analytics.py   Data API / Analytics API reads; parse_* are pure
  auth.py, workspace.py    OAuth files and data dir of one channel owner (platformdirs)
  beatstars/            Track Package (naming, track, package) + Playwright Studio form (studio)
  visual/               Effects (ADR 0011): engine.js (composite, palettes, treatments, Label, cut
                        clock) + effects/<id>.js, one file per Effect; render.html + render.py drive
                        it in headless Chromium, analysis.py computes the per-frame features (numpy);
                        __init__.py is the registry the app offers; lab.html is the Visual Lab;
                        bake.py bakes chain/crown/gem into 24 s loops (data dir `bakes/`) and plays
                        them under header.py's Pillow header, so such a Reel is ffmpeg work
beat_server/            FastAPI app for `serve`
  api/                  routers + pydantic schemas (the OpenAPI the frontend is generated from)
  db/                   SQLAlchemy models, repos, alembic migrations (packaged)
  jobs/                 queue, worker, scheduler, SSE event bus
  services/             sync, pipeline (render -> upload; reel; Still via ffmpeg, else the engine),
                        effects (header words + seed of a Beat), reel (panel state, Show in folder),
                        instagram (the Instagram Post via the claude runner), beatstars (Studio job), stats
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
paste a Bounce Folder path -> Draft, Render Job starts at once (files read in place, ADR 0007)
-> owner edits Metadata on the Beat page while it renders
-> "Save & upload when rendered" -> Queued -> Upload -> Uploaded / Scheduled / Published
```

A Beat's status is what the owner did; a Job is what is happening now. `rendering` is not a
Beat status.

## Design

`design/ds/styles.css` is the one stylesheet the frontend links; `design/ds/readme.md` and
`design/ds/components/*.html` document its classes. It mirrors the Claude Design project
**Beat Upload** (`166cce5a-06a3-489b-824d-031ba1f90d1b`); screens are drawn in **Beat Upload
UI mockups** (`68b7877c-e58e-465a-a16c-ac6026847cd3`). Syncing the mirror with Claude Design
is the owner's own occasional job: never push to or pull from the Design System in a task.
ADR 0005 has the why.

- A visual change made here goes into `design/ds/styles.css`, `readme.md` and the component
  page. Never a local stylesheet in `web/`; Tailwind is layout glue only (flex, grid, gap),
  never colour, radius or type. `web/src/styles/globals.css` is the Tailwind entry point and
  holds nothing else.
- Cascade: `design/ds/styles.css` is imported unlayered, Tailwind utilities live in
  `@layer utilities`, so a DS class silently beats a utility on the same property at any
  specificity. A DS class owns every property it sets; Tailwind may only add others.
- New page or element: the user chooses per task. **Code first** for small things (a variant,
  a column, a state): build it from existing classes, add what is missing to `design/ds/`.
  **Design first** for a new page or interaction (a calendar, a Jobs page): the user draws
  it in the mockups project and hands you the Mockup; build it from the classes.
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

## Effects

- An Effect is one file in `beat_upload/visual/effects/` calling `BeatVisual.register({id, name,
  fam, blurb, init(E), draw(c, A, E)})` plus one `Effect(...)` line in `beat_upload/visual/__init__.py`.
  `E` is the engine (W, H, pal, cover, ext(), extPoster(), treat(), cropRect(), anchor(), header,
  Label...), `A` the per-frame analysis (bands, kick/snare/hat hits and decays, beat clock, cut,
  cutKind, barHit). Use `Math.random`: the Render seeds it per Beat.
- Try it by ear in the Visual Lab: `http://127.0.0.1:8765/visual/lab.html` (same engine and files,
  live Web Audio). Try the Render on a slice: `beat-upload effect ... --seconds 10`.
- The engine draws in Lab pixels (540x960 / 960x540) times `E.S`: the Lab at S = 1, the Render
  at S = 2, straight into the 1080p file (`setFormat(f, s)`). Every pixel constant in
  `engine.js` and `effects/*.js` is written in Lab pixels and multiplied by `S` (fonts, cells,
  shakes); sampling grids (cols/rows of a grey map) stay as they are. The page POSTs each batch
  of JPEG frames to `render.py`'s loopback `_FrameServer` (the same server serves the page), a
  writer thread feeds ffmpeg; 2D Effects run at 15-20 fps (a full track in some 5 minutes), the
  WebGL objects at 2-3 fps (25-30 minutes) unless baked, see below. Still stays the
  ffmpeg-only path.
- The Effect moves the Reel only (ADR 0012): the YouTube video (`video.mp4`, the RENDER job) is
  always Still, the cover in its Cover Style with the Label, and BeatStars gets the same cover.
  `effect` / `reel_effect` on `beats` mirror `cover_style` / `reel_style`; a Reel with
  `reel_effect` NULL is Still. An Effect draws the header (title, artists, BPM, key) into the
  frame: `reel_meta` keeps the words the Reel was painted with, `Beat.header` the words now,
  and the two must match for the Reel to count as current. `Beat.header_ready` is False for an
  Effect while the title holds Placeholders or no name: PATCH queues no REEL then, the REEL job
  refuses, the Instagram panel shows `untitled`, and the title's arrival queues it. Still never
  waits for the title. A new `effect` queues a REEL, never a RENDER, so it may change on a
  Queued beat too.
- Bakes (ADR 0013): chain, crown and gem do not react to the beat, so `beat-upload bake` draws
  each once as a 24 s loop at full quality (`RenderPlan.bake` -> `window.__bake`: no header,
  every motion rate a multiple of 2*pi/24, the gem's stone fixed; five gem files, one per stone,
  the Beat's stone follows its seed). The REEL job plays the loop through ffmpeg with the header
  from `header.py` when the file exists, else the engine draws as usual. New motion in one of
  these three must stay periodic in bake mode, and the bake must be redone (`bake --redo`).
- The Label (black box top right) is off in the engine (`knobs.label`); Still keeps it.
- A Clip (a video in the Bounce Folder instead of the cover) sets `clip_path`; `image_path` is
  then its middle frame in the beat's dir. Still loops it through ffmpeg (`render_clip`); an
  Effect gets a frame per call (`clip_frames`), and `clip: 'live' | 'cuts'` on the Effect's
  registration says whether it plays on or freezes between cuts. `beat-upload effect` takes a
  clip as IMAGE.

## Known state

- OAuth token gets revoked every 7 days while the Cloud Console consent screen is in
  "Testing". Publishing the app to "Production" fixes it. Otherwise reconnect in Settings.
- CLI: `video.mp4` is never re-rendered; delete it to pick up a changed audio, image or
  `cover_style`.
- Videos rendered before Cover Styles (sepia) have `video_style` NULL and count as current
  until the owner picks a style on that Draft.
- `requirements.txt` duplicates `pyproject.toml` dependencies for `pip install -r` users.
