---
status: accepted
date: 2026-11-09
---

# The Effect moves the Reel only; YouTube and BeatStars keep the Still cover

A Beat's Effect (ADR 0011) is painted into the Reel alone, the vertical video for Instagram.
The YouTube video is always Still: the cover in its Cover Style with the Label, looped by
ffmpeg for the whole beat, as every video on the channel has been. BeatStars gets the same
styled cover. The owner decided this on 2026-11-09, when the Effects he kept turned out to be
ray-traced objects over black that ignore the cover: on YouTube the channel reads as one
series of covers, and a moving frame that takes 25 minutes to draw buys nothing there, while
on Instagram the Reel is the whole post.

So:

- The RENDER job renders Still, whatever the Effect; `video_effect` and `video_meta` are
  dropped (migration 0013). `Beat.video_is_current` looks at the Cover Style only.
- The REEL job renders the Effect over the Cover Style; `reel_effect` and `reel_meta` say
  what the Reel on disk has. A changed Effect, or a changed title under an Effect, queues a
  REEL and never a RENDER, so the Effect may change on a Queued beat as well as a Draft; the
  Upload never waits for it (ADR 0009).
- `Beat.header_ready` (was `render_ready`) gates the Reel only: with an Effect and a title
  that does not name the beat yet, no REEL is queued, the job refuses, and the Instagram
  panel shows the Reel as `untitled` until the title arrives.

## Consequences

- The Draft page's Effect picker says it moves the Reel; the Video fact never waits for the
  title. `BeatOut` loses `video_effect` and `render_ready`.
- A full-length Reel with a shader Effect takes minutes to half an hour (ADR 0011); it runs
  behind every other job and holds nothing up. Baking the objects' turns into cached frames
  (the plan in the Visual Lab notes) would bring it back to 2D speed.
- `beat-upload effect` still renders any registered Effect to a file in either format for
  trying it out; the app itself never puts an Effect on YouTube.
