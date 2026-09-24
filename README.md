# YouTube Beat Uploader

CLI that turns a beat (audio + cover image) into a 1080p video with ffmpeg and uploads it to YouTube via the Data API v3.

Status: WIP. Instagram upload is planned, not implemented.

## Requirements

- Python 3.13+
- `ffmpeg` on PATH
- A Google Cloud OAuth client (Desktop app) with the YouTube Data API enabled

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

This gives you the `beat-upload` command. `python main.py` works the same way.

## Usage

### 1. Login

Get a client ID and secret from [Google Cloud Console](https://developers.google.com/youtube/registering_an_application), then:

```bash
beat-upload login --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET
```

Without flags the command prompts for both values. A browser opens for authorization. The token and client secrets are stored in the platform config directory:

| OS      | Path                                          |
|---------|-----------------------------------------------|
| Linux   | `~/.config/beat-upload/`                      |
| macOS   | `~/Library/Application Support/beat-upload/`  |
| Windows | `%APPDATA%\beat-upload\`                      |

If the token expires or is revoked, run `login` again.

### 2. Upload

Put these in one folder:

- exactly one audio file (`.mp3`, `.wav`)
- exactly one image (`.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`)
- `config.yaml`

```bash
beat-upload upload /path/to/beat
```

The video is rendered to `video.mp4` in the same folder. If `video.mp4` already exists it is uploaded as is, so delete it to re-render.

### 3. Stats

```bash
beat-upload channel            # subscribers, views, video count
beat-upload videos             # all uploads, newest first
beat-upload videos -n 10       # last 10
beat-upload video VIDEO_ID     # one video with tags and description
```

### 4. Analytics

```bash
beat-upload analytics          # last 28 days: views, watch time, average view duration per video
beat-upload analytics -d 7     # last 7 days
```

`avd` is the average view duration, `avd%` the share of the video an average viewer
watches. Beats with `avd%` around 50 or more are the ones worth replicating. Videos with
no views in the range are omitted.

### 5. Privacy

```bash
beat-upload privacy unlisted VIDEO_ID [VIDEO_ID ...]
beat-upload privacy private VIDEO_ID
```

Add `--json` to any read command for machine-readable output. The token needs the
`youtube` and `yt-analytics.readonly` scopes; tokens created by older versions lack them,
so run `login` again once.

### 6. Web UI

```bash
beat-upload serve                 # http://127.0.0.1:8765
beat-upload serve --port 9000 --open-browser
```

The server serves the built frontend from `web/dist` (see `web/README.md`; without a build
`/` shows a plain "alive" page) and the API under `/api` (`/api/health`, `/docs`). Its data
lives in the platform data directory (Linux: `~/.local/share/beat-upload/`, sqlite database
and beat files); credentials stay in the config directory above. Override with
`BEAT_UPLOAD_DATA_DIR`, `BEAT_UPLOAD_CONFIG_DIR`, `BEAT_UPLOAD_PORT`.

#### Connect Google from the web UI

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an
OAuth client of type **Web application** (the CLI `login` uses a Desktop client; the web UI
needs its own) with the authorised redirect URI
`http://localhost:8765/api/auth/google/callback` (adjust the port if you run `serve` with
another one). Open Settings in the UI, paste the client ID and secret, click **Save**, then
**Connect YouTube**: Google asks for consent and sends you back to Settings, which shows the
channel title. The secret is stored in the config directory and never shown again.
**Disconnect** deletes the token and keeps the client. A banner at the top of every page
says when the connection is missing or expired.

#### Settings

The page is three rows, what on the left and how on the right:

- **YouTube** — the client ID and secret, an account card with the channel title and the
  connection state (Connected, Access expired, Not connected, No client yet), and
  **Reconnect now** / **Disconnect**. Coming back from Google, the page says whether it
  worked and dismisses the message.
- **Nightly stats** — the hour the nightly pull runs at (local time) and when it last ran.
  **Run now** starts the same pull from YouTube by hand and shows the job it made, with its
  progress, right there.
- **Templates** — the title, description and tag templates every new Beat starts from;
  `{name}` becomes the audio file name without extension.

#### Add a beat from the web UI

Press **New beat** (Library page or the top navigation). The page has two slots: one for
the audio file (`.mp3`/`.wav`) and one for the cover image (`.png`/`.jpg`/`.jpeg`/`.gif`/`.bmp`).
Drop or pick each file on its own, from any folder; dropping both at once onto either slot
also works. Press **Create beat**. This creates a draft with the title, description and tags from your templates
(`title_template`, `description_template`, `tags_template` in `PUT /api/settings`; `{name}` is
the audio file name without extension) and opens its page.

The render starts right there, on the draft, so ffmpeg is working while you write. A draft's
status stays **Draft** the whole time — the status says what you did with the beat, the job
next to it says what is happening to it — and the draft is marked **Rendered** once the video
file is ready. Edit the metadata (same limits as `config.yaml`: title 100, description 5000,
tags 500 characters in total) and press **Save & upload when rendered**: the beat becomes
**Queued** at once. If the render has finished the upload starts immediately; if it has not,
the upload starts by itself when the render is done. When it is done the page links to the
video. A render that fails leaves the beat where it was, Draft or Queued, with the error on
the job — **Retry now** runs it again and the upload still follows. Privacy offers Private,
Unlisted, Public and **Scheduled**: Scheduled reveals a date-and-time field (your local time,
prefilled with tomorrow at the current hour) and uploads the video as private with that
publish time, so YouTube makes it public then whether or not this machine is on. Until then
the Library card and the Beat page show **Scheduled** with the time. The time must be at
least 5 minutes ahead; if it has already passed when the upload job runs, the job fails, the
Beat returns to draft and you pick a new time. A draft can be deleted
with **Delete draft**, which also throws away its render, running or finished;
anything already on YouTube cannot be deleted from here. If YouTube is
not connected the upload job pauses and continues after you connect in Settings. If the
network drops (laptop asleep, Wi-Fi down) the job waits and retries by itself, five times
over about an hour, before giving up; **Retry now** on the job skips the wait.

#### Change the visibility of an uploaded beat

Once a beat is on YouTube its page keeps the same Privacy selector, working like the one in
YouTube Studio. Private, Unlisted and Public apply as soon as you pick them. Picking
**Scheduled** shows the date-and-time field (your local time) and a **Schedule** button;
nothing changes until you press it. The video is set to private with that publish time, and
the beat shows **Scheduled** with the time. On a Scheduled beat the field shows the current
time: enter another one and press **Schedule** to reschedule, pick Private or Unlisted to
cancel the schedule (the beat is back to uploaded), or pick Public to publish now; that last
one asks once, since it cannot be undone. The same rule as for drafts applies: the time must
be at least 5 minutes ahead, otherwise the page shows the error and nothing is sent to YouTube.

#### Statistics

The server collects daily views and watch time per video from the Analytics API once a
night (hour in Settings, default 04:00 local; a run missed while the machine was asleep
happens at the next start, a run that failed is retried an hour later, up to three
times a day). The first run
backfills the last 90 days. The Library shows
the channel totals for the last 28 days, each Beat page its own chart. "Collect stats now"
on the Library page (or `POST /api/stats/collect`) runs the job immediately. The same
minute scheduler watches Scheduled Beats: once a publish time has passed it runs one sync
so the badge flips to Published within about a minute while the machine is on, and on the
first tick after sleep; a sync also picks up a time changed or removed in YouTube Studio.

### 7. Run as a service

To keep the web UI running permanently (Linux, systemd):

```bash
beat-upload install-service               # writes ~/.config/systemd/user/beat-upload.service
beat-upload install-service --port 9000   # default port is 8765
systemctl --user daemon-reload
systemctl --user enable --now beat-upload
loginctl enable-linger $USER              # start at boot, without logging in
```

The unit runs `<venv>/bin/beat-upload serve --port 8765` from the virtualenv you installed
into, restarts on failure and opens `http://127.0.0.1:8765` after every reboot. A copy of
the unit with placeholders is in `deploy/beat-upload.service`.

Data stays where `serve` keeps it: `~/.local/share/beat-upload/` (sqlite database, beat files)
and `~/.config/beat-upload/` (client secrets, token). Logs: `journalctl --user -u beat-upload -f`.

### config.yaml

```yaml
youtube:
  title: "My Beat Title"          # required, <= 100 chars
  description: "Produced by ..."  # optional, <= 5000 chars
  tags:                           # optional
    - beats
    - instrumental
  category_id: 10                 # optional, default 10 (Music)
  privacy_status: private         # optional: private (default) | public | unlisted
  publish_at: 2026-10-01 18:00    # optional, local time: upload as Scheduled, YouTube
                                  # makes it public then; needs privacy_status: private
```

`publish_at` must be at least 5 minutes ahead when the upload runs; a time that has already
passed is an error, never silently moved.

## Project layout

```
main.py                   entry point (python main.py ...)
beat_upload/
  cli.py                  Typer commands: login, upload, channel, videos, video, analytics, privacy
  beat_folder.py          finds the audio and image in a beat folder
  config.py               loads and validates config.yaml
  video.py                renders the video with ffmpeg
  youtube.py              uploads and edits privacy through the YouTube Data API
  stats.py                reads channel and video statistics (Data API)
  analytics.py            per-video watch time and view duration (Analytics API)
  auth.py                 OAuth2 client secrets and token storage
  workspace.py            where one channel owner's files live (config dir, data dir)
  errors.py               exceptions the CLI reports without a traceback
beat_server/              FastAPI app for `serve`: settings, SQLite models/repos, migrations
web/                      React frontend, built into web/dist and served by beat_server
tests/                    pytest unit tests (no network, no ffmpeg)
```

## Development

```bash
pip install -e '.[dev]'
ruff check . && ruff format .
pytest
cd web && npm install && npm run lint:tokens && npm run api:check && npm test && npm run build
```

Database schema changes: edit `beat_server/db/models.py`, then
`alembic revision --autogenerate -m "..."` (config in `alembic.ini`, scripts in
`beat_server/db/migrations/`). The server applies migrations itself on startup.
