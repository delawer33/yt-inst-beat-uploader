---
status: accepted
date: 2026-10-13
---

# The Reel is its own Job and never holds up YouTube

Every Draft gets a Reel (`reel.mp4`, 1080x1920, beside `video.mp4`) from a REEL Job of its
own, queued wherever a RENDER is queued for a Draft (a new Draft, a Cover Style change) and
by the Instagram panel when the Beat has none current. It runs for a Beat in any status that
has audio and cover on disk, so a Published Beat made before Reels gets one when the owner
first opens the panel. It does not touch the Beat's status and enqueues nothing behind it.

We kept it out of the RENDER because the RENDER leads to the Upload and the owner is waiting
on that; a second ffmpeg pass there would slow every send for a file Instagram needs later.
There is one worker and it runs jobs one at a time, so a separate Job is not enough: a REEL
queued before an UPLOAD would still run first. `JobRepo.next_queued` therefore puts every
REEL behind every other kind. A Reel that is already running does hold up an Upload until it
ends (minutes); stopping it half way was judged worse than the wait.

## Consequences

- The Beat's `active_job` (the Library's "Working" filter, the Draft's progress) never shows a
  REEL; the Instagram panel reads it from `GET /api/beats/{id}/instagram`.
- Like the RENDER, the Reel is written to `reel.part.mp4` and moved over only if the Cover
  Style is still the one it was painted in; a stale one is dropped and another REEL queued.
- A failed REEL is not queued again by looking at the panel (that would loop on a render that
  always fails): the panel shows the error and the Job page retries it.
- `beats.reel_path` / `reel_style` mirror `video_path` / `video_style`; no legacy rows exist,
  so `reel_is_current` needs no "style unknown" case.
