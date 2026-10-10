---
status: accepted
date: 2026-10-10
---

# A public beat goes onto BeatStars first, then to YouTube with the link

Sending a public or scheduled Bounce Folder beat queues a BEATSTARS Job next to the Render.
The Upload waits for both: whichever finishes last queues it. The Job fills BeatStars Studio
in a real browser window (there is no API) and releases the Track at the moment YouTube will,
now or the scheduled time. The video's description holds the marker
`{beatstars|<fallback>}` in the Template; the Beat keeps the marker and only what goes to
YouTube has it swapped for the Track's URL, or for the fallback when there is no Track.

We put BeatStars first because the description is written once at upload and the link only
exists after the Track does; the other order costs a second YouTube call (`videos.update`,
50 quota units) for every beat. That call is still used for a beat put on BeatStars later.

## Consequences

- A failed BEATSTARS Job leaves the Beat Queued; the error is on the Job and a retry
  continues the same Studio draft (the track id is saved the moment Studio makes it). The
  owner may instead choose "Upload without BeatStars" (`POST /api/beats/{id}/skip-beatstars`,
  only for a Queued beat whose BeatStars Job failed): the Beat is marked skipped and the
  description gets the fallback.
- The Upload can start minutes after the video is rendered, and a scheduled publish time that
  passes while Studio works fails the Upload the way it always did (the Beat goes to Draft).
- The web server needs a display: the service gets `WAYLAND_DISPLAY`, and the window (class
  `beat-upload-beatstars`) opens on the owner's desktop for the first sign-in and for
  Studio's own prompts. A server without a display cannot send a public beat.
- A private or unlisted send skips BeatStars and the description gets the fallback.
