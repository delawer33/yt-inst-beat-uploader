# CLAUDE.md

CLI that renders a beat (audio + cover image) into a 1080p video with ffmpeg and uploads it
to YouTube via the Data API v3. Instagram is mentioned in the repo name but has never been
implemented; treat it as out of scope unless asked.

## Commands

```bash
source .venv/bin/activate
pip install -e '.[dev]'        # installs the `beat-upload` console command
ruff check . && ruff format .  # lint + format (config in pyproject.toml)
pytest                          # unit tests, no network, no ffmpeg
pytest tests/test_config.py -k privacy   # single test
beat-upload login --client-id ID --client-secret SECRET
beat-upload upload test_data    # real upload, needs a valid token
beat-upload videos --json       # all uploads with views/likes; also channel, video ID
beat-upload analytics -d 28     # per-video views, watch time, AVD, AVD% (Analytics API)
beat-upload privacy unlisted ID # change privacy of existing videos
```

`python main.py ...` is equivalent to `beat-upload ...`.

## Layout

```
main.py                 entry point
beat_upload/
  cli.py                Typer commands only: argument parsing and echo. No logic.
  beat_folder.py        find_beat_folder(): the one audio + one image rule, file names
  config.py             config.yaml -> YouTubeMetadata dataclass, all validation
  video.py              render_video(): ffmpeg command
  youtube.py            upload_video(), set_privacy(): Data API calls
  stats.py              YouTubeStats: channel(), videos(), video(); parse_* are pure
  analytics.py          YouTubeAnalytics.videos(start, end); parse_video_report is pure
  auth.py               client secrets + token in ~/.config/beat-upload/ (platformdirs)
  errors.py             BeatUploadError hierarchy
tests/                  pytest, mirrors the modules
test_data/              gitignored real beat folder used for manual runs
```

Upload flow: `find_beat_folder` -> `load_youtube_metadata` -> `get_valid_credentials`
-> `render_video` (skipped if `video.mp4` exists) -> `upload_video`.

## Analysing the channel with Claude

Run `beat-upload videos --json` (or `channel --json`, `video ID --json`) via Bash and
reason over the output. Compute top-N, averages and comparisons yourself; do not add
aggregate commands to the CLI. Data API quota is 10 000 units/day, reads cost 1 unit,
an upload costs 1600. `analytics` uses the Analytics API (separate quota) grouped by
video; CTR is not exposed by any API, only in YouTube Studio.

## Conventions

- Expected failures raise a `BeatUploadError` subclass with a message a user can act on.
  `cli.py` catches only the base class and prints it without a traceback. Never catch
  `Exception` broadly, never `print` outside `cli.py`.
- Every constant that describes the beat folder (extensions, `config.yaml`, `video.mp4`)
  lives in `beat_folder.py`. Every YouTube limit lives in `config.py`.
- `pathlib.Path` everywhere, no `os.path`. Python 3.13, `StrEnum`, `X | None`.
- New metadata field: add to `YouTubeMetadata`, validate in `from_mapping`, use in
  `youtube.py`, cover with a test in `tests/test_config.py`, document in README.
- Tests must not touch the network, ffmpeg or the real config dir. Use `tmp_path`.

## Do not commit

`token.json`, `client_secrets.json`, `yt-secrets.json`, `session-*.md`, `test_data/`.
All are gitignored; the stray copies in the repo root are leftovers and unused by the code.

## Known state

- OAuth token gets revoked every 7 days while the Cloud Console consent screen is in
  "Testing" status. Publishing the app to "Production" fixes it. Otherwise `beat-upload login`.
- `video.mp4` is never re-rendered. Delete it to pick up a changed audio or image.
- `requirements.txt` duplicates `pyproject.toml` dependencies for `pip install -r` users.
