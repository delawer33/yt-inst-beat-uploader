# Beat Upload

Turns a beat (audio + cover) into a 1080p video, uploads it to YouTube and tracks how it performs.

Posting a beat by hand is the same forty minutes every time. Render a video, copy the
description, fix the tags, upload, set the time. Then open BeatStars and do it again in
Studio. This app does the whole run from one pasted folder path, on your machine, and
remembers how every beat on the channel is doing afterwards.

![Library](docs/img/library.png)

## What it does

- **One folder in, a Draft out.** Paste the path of a bounce folder (WAV, tagged MP3,
  cover, stems; BPM, key and moods in its name). The render starts while you write the
  metadata. Nothing is copied.
- **Metadata from templates.** Title, description and tags come prefilled, with a
  YouTube-style preview. "Fill from title" writes the description and tags for you through
  the local `claude` command.
- **Seven cover styles and a label.** Every render paints the cover in one of seven fixed
  looks and stamps the channel's label, so the channel reads as one series.
- **Save & upload when rendered.** The upload queues itself and runs once the video is ready.
- **Publish now or on schedule.** YouTube makes a scheduled video public on its own, even
  with the laptop closed.
- **Privacy of anything on the channel**, the way YouTube Studio does it.
- **BeatStars with the link in the description.** A public or scheduled beat goes onto
  BeatStars first, then to YouTube with the track's URL. Details below.
- **A Reel for Instagram.** Every beat also gets a 1080x1920 vertical video, plus a written
  post (hook, caption, hashtags, handles) you copy into Instagram by hand.
- **The channel's history.** Imports every video the channel had before the app, pulls daily
  views and watch time from the Analytics API every night and charts them per beat.
- **Survives reboots.** Runs as a user systemd service.

The CLI does the YouTube part without the UI: `login`, `upload`, `videos`, `analytics`,
`privacy`, and `beatstars prepare` / `beatstars upload` for the store.

## Quick start

Needs Python 3.13, `ffmpeg` on PATH and a Google Cloud OAuth client with the YouTube Data
and Analytics APIs enabled.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
beat-upload serve --open-browser     # http://127.0.0.1:8765
```

Connect the channel on the Settings page. To keep it running after a reboot:

```bash
beat-upload install-service          # writes the systemd user unit and prints the enable commands
```

> [!NOTE]
> While the Cloud Console consent screen is in "Testing", Google revokes the token every
> 7 days. Publish the app to "Production" or reconnect in Settings when it happens.

## BeatStars

BeatStars has no API, so the app fills the Studio form in a real browser (Playwright).

```bash
pip install -e '.[beatstars]' && playwright install chromium
beat-upload beatstars prepare ~/bounces/Diavolo --youtube-id -3aBT57ZdEo
beat-upload beatstars upload ~/bounces/Diavolo/beatstars   # --no-publish leaves a draft
```

### What the bounce folder holds

- **Untagged master**: `NAME_95bpm_Cmin_dark-intense_delawer.wav`.
- **Tagged bounce**: the same name with `_tagged`, `.wav` or `.mp3`.
- **A cover**, and optionally the beat's `config.yaml`.

The name parts are: name, tempo, key, moods (optional, joined with `-`), `smp` when there
are foreign samples, `delawer`.

### What `prepare` and `upload` do

- **`prepare`** cuts the leading silence of both bounces at the same bar, encodes a 320k
  tagged MP3, squares the cover and writes `beatstars.json`: title, description, 3 tags,
  genres, moods and instruments, built from the YouTube title in `config.yaml`. Edit the
  json, then `upload`.
- **Moods, instruments and genres** must be spelled as Studio lists them; the lists live in
  `beat_upload/beatstars/catalog.py`.
- **`--release-at 2026-10-12T15:00`** (local time) schedules the track instead of publishing
  it now.
- **A failure keeps the track.** Studio creates it at the first file and the command prints
  its `TK` id at once. A failure afterwards says `finish it with --draft TK...`.
- **Sign in once.** The first run opens Studio for you to sign in; the session stays in the
  workspace.

### From the web app

A Draft made from a bounce folder and sent public or scheduled goes onto BeatStars first and
onto YouTube after (ADR 0008):

1. "Save & upload when rendered" queues a BeatStars job next to the render.
2. The upload waits for both and the track is released when the video is, now or at the
   scheduled time.
3. A private or unlisted send skips BeatStars.

- **If Studio fails**, the beat stays Queued with the error on the job. Retry continues the
  same Studio draft; "Upload without BeatStars" sends the video with the fallback text in
  the description.
- **"Put on BeatStars"** appears on a Published or Scheduled beat that has no track yet
  (sent private, or sent without BeatStars). It runs the same job, released now or at the
  publish time, then updates the YouTube description so the marker becomes the link
  (`videos.update`, 50 quota units).

> [!IMPORTANT]
> Put the marker in your description template once, with the text for beats without a
> track after the `|`:
>
> ```
> {beatstars|DM @delawer33 on Instagram}
> ```
>
> At upload it becomes the track's URL, or that text when the beat has none. Fill from title
> leaves it alone.

> [!IMPORTANT]
> The Studio window is a real browser, so the service needs your display. Run
> `systemctl --user import-environment WAYLAND_DISPLAY` from your compositor's autostart
> (the unit from `install-service` passes it on), then restart the service. The window has
> the class `beat-upload-beatstars`, so a window manager rule can keep it on another desktop.

## How it works

One Python package with no web or database code renders the video with ffmpeg and talks to
YouTube. A FastAPI server on top keeps a SQLite library, a job queue and a scheduler, and
serves the React frontend.

- **A beat's status is what you did**; a job is what is happening right now. Rendering is
  never a beat status (ADR 0004).
- **A video is never re-rendered.** Only a new cover style makes a new one.
- **The Reel is its own job** and runs behind everything else, so it never delays an
  upload (ADR 0009).
- **The Instagram post is written once** by `claude` and kept; code assembles the caption
  and checks the 2200-character limit (ADR 0010).

Full guide: [docs/guide.md](docs/guide.md). Why it is built this way: [docs/adr](docs/adr).
Vocabulary: [CONTEXT.md](CONTEXT.md).

## Status

In daily use on one channel. Instagram is in the repo name, but nothing is sent there: the
Reel and the post are copied into Instagram by hand.

## For development

```bash
pip install -e '.[dev]'
ruff check . && ruff format .
pytest                                # no network, no ffmpeg
cd web && npm run dev                 # Vite on :5173, proxies /api to :8765
```

Process rules, layout and the design system are in [CLAUDE.md](CLAUDE.md).
