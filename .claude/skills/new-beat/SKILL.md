---
name: new-beat
description: Publish a new beat end to end through the local Beat Upload app — the owner only says "новый бит", the artists (type beat), the mood, maybe the genre and where the cover is. Finds the Bounce Folder, puts the cover in, creates the Draft, writes the title/description/tags, picks the schedule slot, asks which Effect the Instagram Reel gets, sends it, watches the jobs, retries, and reports what is where. Use when the owner says «новый бит», «появился бит», «выложи бит», «залей бит», names a type-beat artist pair as a new beat, or invokes /new-beat.
---

# New beat → BeatStars + YouTube (scheduled) + Reel for Instagram

You run the whole release for the owner (delawer). He says only: that a beat appeared, the
artists it is a type beat for, the mood, maybe a genre, and where the cover is. Everything
else is yours: find the folder, fill the metadata, schedule, send, watch, retry, report.
You never ask him to click in the app. You ask him only for things only he can do (listed
at the end) and for the Reel's Effect.

The app: `beat-upload serve` as the user unit `beat-upload.service` on `http://127.0.0.1:8765`
(web + API). The API is what you drive; the owner may be watching the same state in the web UI.
Glossary and rules: `CONTEXT.md`, `CLAUDE.md` of this repo. Time zone: the machine's local
time (MSK, UTC+3). Dates in API bodies without a zone count as local time.

## 0. Before anything: what is the state?

Run these and read them; never assume.

```bash
systemctl --user is-active beat-upload.service || systemctl --user restart beat-upload.service
curl -s http://127.0.0.1:8765/api/jobs | python3 -m json.tool | head -60    # paused/failed jobs? "Google connection is missing" means the owner must reconnect (see §8)
curl -s "http://127.0.0.1:8765/api/beats" | python3 -c 'import json,sys; [print(b["status"], b["publish_at"] or b["published_at"], b["title"][:70]) for b in json.load(sys.stdin)]'
cd /home/delawer/all/projects/yt-inst-beat-uploader && .venv/bin/beat-upload bake --status      # which object Effects have their bake (fast Reel)
```

What the app does, so you can tell the owner the truth:

- **YouTube video** (`video.mp4`, RENDER job): always Still — the cover in the Cover Style
  "Film Grain" (default) with the Label. ~1–2 min of ffmpeg. Never an Effect (ADR 0012).
- **BeatStars**: the same styled cover + the track (+ stems zip) through Playwright Studio
  (BEATSTARS job), only for a public or scheduled beat, before the YouTube upload. Published
  there immediately (BeatStars has no schedule).
- **Reel** (`reel.mp4`, REEL job, Instagram): the Beat's **Effect** over black with the header.
  Chain / Crown / Gem play from a **bake** when `bake --status` says `baked` → ~1 min. Any
  other Effect, or a missing bake, renders frame by frame in headless Chromium → 25–30 min
  for a full beat, in the background; it never holds up YouTube (ADR 0009).
- **Instagram**: nothing is posted automatically. You render the Reel and write the Instagram
  Post (`POST /api/beats/{id}/instagram`); the owner posts by hand.

## 1. Find the beat

Bounce Folders live in **one place**: `/media/delawer/9006259B06258378/!beats/`. One folder per
beat, named `<BPM>bpm_<Key>_<moods>_<instruments>[_smp...]` (e.g.
`168bpm_F#min_catchy-cloudly-euphoric_synth-delay-hihat`). The newest folder (mtime) that is not
yet a Beat in the app (`bounce_folder` in `GET /api/beats`) is the new beat; if two are new,
ask which. The folder must hold the WAV/MP3 (+ optional stems dir) and **one** cover image.

**Cover**: the owner either put it into the folder himself, or says it is in `~/Downloads`
("скачал в downloads", "в загрузках"). Then take the newest image there (`ls -t ~/Downloads/*.{jpg,jpeg,png,webp}`),
confirm its name with him in one line if several arrived in the last hour, convert webp to jpg
if needed (`ffmpeg -i in.webp out.jpg`), and **move** it into the Bounce Folder as `cover.jpg`
(a folder with two images is refused). Never put a second image in.

## 2. Create the Draft

```bash
curl -s -X POST http://127.0.0.1:8765/api/beats/from-folder -H 'Content-Type: application/json' \
  -d '{"path": "/media/delawer/9006259B06258378/!beats/<folder>"}'
```

422 names what is wrong with the folder (missing audio, two covers, no BPM/key in the name): fix
the folder, do not work around it. Keep the returned `id`. This queues the RENDER (Still) and a
REEL (Still until an Effect is picked) at once.

## 3. Title, description, tags

Build the title yourself from what he said, in the house format (memory `title-metadata-format`):

- Two artists: `[FREE] <A> Type Beat x <B> Type Beat 2026 - "<NAME>" | <Genre>`
- One artist or an instrument/genre: `[FREE] <A> Type Beat 2026 - "<NAME>" | <Genre>`
- `<NAME>`: one or two evocative words from the mood/instruments (he may name it himself);
  Title Case; not a name already used on the channel (check the list from §0).
- `<Genre>`: what he said, else from the artists (e.g. Melodic Trap, Rage, Drill, Orchestral / Trap Beat).
- Year: the current year.

Then let the app write the description and tags from that title (it runs the local `claude`,
up to a minute), and save everything:

```bash
curl -s -X POST http://127.0.0.1:8765/api/beats/<id>/fill -H 'Content-Type: application/json' \
  -d '{"title": "<title>", "description": "", "tags": []}'
# -> {"description": ..., "tags": [...], "beatstars_moods": [...], "beatstars_instruments": [...]}
curl -s -X PATCH http://127.0.0.1:8765/api/beats/<id> -H 'Content-Type: application/json' \
  -d '{"title": "<title>", "description": <description>, "tags": <tags>, "beatstars_moods": <moods>, "beatstars_instruments": <instruments>}'
```

Check the description's first line is the title and the tags start with the artist tags; fix by
hand in the PATCH if the fill drifted. Title ≤ 100 chars, tags ≤ 500 chars in all.

## 4. The slot

Five beats a week, one a day, at **20:00 local** on **Sun, Mon, Tue, Wed, Thu** (producers and
rappers browse type beats on weekday evenings and Sunday night; Friday and Saturday evenings are
the quiet ones). The slot of this beat is the earliest of those days, today included, that has
no beat already scheduled or published on that date (the list from §0: `publish_at` of
scheduled, `published_at` of published, local dates).

If that day is **today**:

- The whole run needs about 30 minutes of margin (render 2 min, BeatStars 5–10 min, upload 5 min,
  plus retries). If it is before 19:30 → 20:00.
- If 20:00 has passed or cannot be made, but 22:00 can (before 21:30) → **22:00** without asking.
- Else → propose the next slot day at 20:00 in one line and wait for his yes before sending.

Write the slot as a naive local time string, e.g. `"2026-11-10T20:00:00"`.

## 5. The Effect of the Reel — always ask

Ask him, in one line, with this list and nothing else (these are the Effects he chose for
Instagram on 2026-11-09): **Burst, Chain, Crown, Dagger, Doubloon, Flow, Gem**. Mark which are
instant: `(быстро)` for Chain, Crown and Gem when `bake --status` says `baked`; the others `(~30 мин, в фоне)`. Pick nothing for him. If he answers before you asked, use it.

The ids are lower case: `burst, chain, crown, dagger, doubloon, flow, gem`.

## 6. Send

```bash
curl -s -X PATCH http://127.0.0.1:8765/api/beats/<id> -H 'Content-Type: application/json' \
  -d '{"effect": "<effect>", "privacy": "private", "publish_at": "<slot>"}'
curl -s -X POST http://127.0.0.1:8765/api/beats/<id>/upload
```

`privacy: private` + `publish_at` = Scheduled: YouTube makes it public at the slot by itself.
The PATCH queues the REEL for the Effect (it waits for the title, which you have set). The
upload call makes the beat Queued and queues BEATSTARS; the UPLOAD follows when the video is
rendered and BeatStars is done. A 409/422 on these calls says exactly what is wrong (a
Placeholder left in the title, a publish time in the past): fix and call again.

## 7. Watch, retry, verify

Poll every ~30 s until the beat is `scheduled`; the Reel is `ready` within a minute for a baked
Effect, else it keeps `rendering` for 25–30 min in the background — then report without waiting
and check it once more at the end of the conversation or when he asks:

```bash
curl -s http://127.0.0.1:8765/api/beats/<id> | python3 -c 'import json,sys; b=json.load(sys.stdin); print(b["status"], "rendered" if b["rendered"] else "not rendered", b["active_job"] and (b["active_job"]["kind"], b["active_job"]["status"], b["active_job"]["message"], b["active_job"]["error"]), b["beatstars_url"], b["youtube_url"])'
curl -s http://127.0.0.1:8765/api/beats/<id>/instagram | python3 -c 'import json,sys; print(json.load(sys.stdin)["reel"])'
curl -s "http://127.0.0.1:8765/api/jobs" | python3 -c 'import json,sys; [print(j["kind"], j["status"], j["progress"], j["error"]) for j in json.load(sys.stdin) if j["beat_id"]=="<id>"]'
```

- A **failed** job: read `error`. Retry once with `POST /api/jobs/<job_id>/retry`. If it fails
  again, read the server log (`journalctl --user -u beat-upload.service -n 100`), fix the cause if
  it is in the code or the folder, and retry; otherwise tell the owner what failed and what you
  need. Never mark the task done with a failed job.
- **BEATSTARS** failing on login / captcha / a changed Studio form: that is the owner's — tell him
  the BeatStars window (workspace 11, the Playwright profile) needs him, and offer
  `POST /api/beats/<id>/skip-beatstars` only if he says to go without BeatStars.
- **UPLOAD paused** with "Google connection is missing or expired": only the owner can reconnect
  (Settings → Google in the web UI). Tell him; the worker resumes the job after the reconnect.
- A **network** error: the worker retries by itself; wait.
- The Reel state `untitled` means the title did not pass yet — you forgot §3.

Done means: status `scheduled` with `youtube_url` and `publish_at` at the slot, `beatstars_url`
set (or BeatStars explicitly skipped by him), Reel `ready`. Then write the Instagram Post:
`POST /api/beats/<id>/instagram`, and read it back with `GET .../instagram`.

## 8. Report

One short message, in Russian, no more than needed:

- the title; YouTube: scheduled for `<date 20:00>`, the link; BeatStars: the link;
- Reel: ready, Effect `<name>`, `Show in folder` works from the Instagram panel; the Instagram
  Post is written (hook + caption are in the panel);
- anything that is NOT done and why, and what you need from him (reconnect Google, a BeatStars
  login, a cover).

Never claim a step done you have not seen in the API's answer.

## What only the owner can do

Reconnect Google (OAuth token, Settings); log in to BeatStars / solve a captcha; choose the
Reel's Effect; put a cover somewhere; post on Instagram. Everything else is yours, including
reading errors, fixing a folder, retrying, and moving the slot by the rules above.
