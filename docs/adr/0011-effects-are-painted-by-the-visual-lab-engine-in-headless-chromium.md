---
status: accepted
date: 2026-10-31
---

# Effects are painted by the Visual Lab's engine in headless Chromium

An Effect is JavaScript on a 2D canvas: the engine the owner designs Effects with in the
Visual Lab (composite of the cover, Cover Style palettes, treatments, the Label, the header)
lives in `beat_upload/visual/` and the Render runs the same engine in headless Chromium
(Playwright, already a dependency for BeatStars). Python decodes the audio and computes the
features the engine needs per frame (bands, kick / snare / hat onsets, the beat clock from the
Bounce Folder's BPM, the waveform at a hit); the page draws one frame per call and hands back a
JPEG; the frames are piped into ffmpeg with the audio. Randomness is seeded per Beat, so a
Render is reproducible.

One Effect is one file in `beat_upload/visual/effects/` plus one line in the Python registry
that names it for the UI. The Visual Lab (`/visual/lab.html` on the local server) loads the
same files with live Web Audio, so an Effect that works there needs no port.

The alternative was to port each Effect to Pillow and numpy and render one picture per cut
(the "Montage" family mostly stands still between hits), which renders in seconds instead of
minutes. We did not take it because every new Effect would then be written twice, in the lab
and in Python, and because VJ Cut, the first Effect the owner wants, lives between the hits
(ASCII and Riso treatments breathe with the bass and hats), so it needs every frame anyway.
Pure ffmpeg filters fit none of the chosen Effects.

## Consequences

- A Render with an Effect takes minutes, not seconds: every frame is drawn. The engine draws
  straight at the file's size (the Lab's 540x960 / 960x540 times `S` = 2, since 2026-11-01;
  before that it drew at the Lab's size and the frame was scaled by two, which blurred the
  text and the dots). The frames leave the browser as binary POSTs in batches to a loopback
  server in `render.py`, not over Playwright's channel, where a base64 answer per frame cost
  more than the drawing. x264 runs at `veryfast`: at `medium` it took 2.5x the drawing's time.
- The Render needs Playwright's Chromium (downloaded into the data dir on first use, as for
  BeatStars). The Still Effect keeps the ffmpeg-only path and never needs it.
- Features are computed in Python, so the Lab (Web Audio, live) and the Render (numpy,
  offline) may differ in a hit or two; the Lab is for taste, the Render is the truth.
- A Clip in the Bounce Folder takes the cover's place: Still runs it through the same ffmpeg
  graph (looped, muted); an Effect gets its frames one per call, decoded by ffmpeg at the
  render's rate, and the Effect's `clip` field says whether the picture plays on under the
  treatments ("live", VJ Cut) or stands still between cuts ("cuts").
- The header (title, artists, BPM, key) is in the frame, which the Still path never had. So an
  Effect render waits for the title (no Placeholders, a name), a changed title makes the file
  stale (`video_meta` against `Beat.header`), and the words are recorded next to the file.
- The Label is not drawn by the engine (owner's call, 2026-10-31); the Still path keeps it.
- The other ten cut variants and per-Beat knobs (cut rate, intensity) are not in; the engine
  carries them and they can come one file at a time.
