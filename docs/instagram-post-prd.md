# PRD: Reel and Instagram Post

Glossary: [CONTEXT.md](../CONTEXT.md) (Reel, Instagram Post, Artist Handle, Cover Style, Label,
Render, Job, Draft, Scheduled, Placeholder, Fill from title). Decisions:
[ADR 0002](adr/0002-core-package-stays-web-and-db-free.md),
[ADR 0004](adr/0004-render-starts-on-draft-status-is-the-owners-action.md),
[ADR 0005](adr/0005-the-look-comes-only-from-the-design-system.md),
[ADR 0006](adr/0006-fill-from-title-runs-the-local-claude-cli.md).

Status: grilled with the owner on 2026-10-13. Sources the owner gave: ten transcripts of
producer videos about Instagram in `dev/insta_transcripts/` (gitignored).

## Problem Statement

The owner posts every beat to Instagram as well as YouTube, by hand. Today they post the
horizontal YouTube video, which Instagram shows as a thin strip inside a vertical Reel and
keeps out of recommendations. For each post they also make up the caption, hashtags, tags
and audio name from scratch, without a rule for what Instagram rewards. They want no
automation of Instagram itself: one button on the Beat page that shows what to type, and
a way to get at the video file.

## Solution

Every Render also makes a **Reel**: a 1080x1920 video of the whole beat, the cover full width
in its Cover Style with the Label, on a blurred and darkened copy of the same cover, set a
little above centre so the caption area covers background, not the picture. The owner cuts
the 30 seconds they want inside Instagram, as they do now.

An **Instagram** button on the Beat page opens a panel with the **Instagram Post**: every field
in the order Instagram asks for it, each with a copy button, plus "Show in folder" (the file
manager opens with the Reel selected) and a "Posted on Instagram" switch. The text is written
once by the local `claude` CLI (as Fill from title is), kept with the Beat, and written again
only on request. Artists named in the title are tagged by their **Artist Handle**, which the
owner types once per artist; the model never invents a handle.

What the panel shows, for "Dance With Me" (approved shape, wording is the model's):

```
On-screen text   this guitar x reggaeton beat is crazy 🎸
Caption          "Dance With Me" — guitar x reggaeton type beat 🎸 90 BPM · A minor
                 Free for non-profit use
                 License / download: https://www.beatstars.com/TK26407192
                 @artist1 @artist2

                 #typebeat #guitartypebeat #reggaetontypebeat #reggaebeat #prodbydelawer
Tag people       @artist1, @artist2
Audio name       Dance With Me (prod. delawer)
Alt text         Cover art for "Dance With Me", a guitar x reggaeton type beat by delawer
Publish time     15.10.2026 18:00 (the YouTube time)
Trial reel       on: shown to non-followers first; add to profile if it does well
BeatStars link   https://www.beatstars.com/TK26407192   (to send to people who comment)
```

The Instagram rules this follows, from the transcripts and Instagram's own limits:
the first line carries the searchable words (caption keywords now count for more than
hashtags); at most five hashtags (Instagram's limit since December 2025), sized
20k–500k posts, no giants; links in a caption are not clickable, so "link in bio" (the
owner's profile link is the BeatStars store) plus a comment-to-DM call; a short on-screen
hook because the picture is static; trial reels for reaching non-followers; a named audio
so other people's Reels with the beat lead back.

## User Stories

1. As the owner, I want every new Draft to render a Reel alongside the YouTube video, so that it is ready when I want to post.
2. As the owner, I want the Reel in the Cover Style I chose for the Beat, so that Instagram and YouTube look like one series.
3. As the owner, I want the Label on the Reel's cover, so that the beat carries my mark on Instagram too.
4. As the owner, I want the Reel's background to be the same cover blurred and darkened, so that the vertical frame has no empty black.
5. As the owner, I want the cover placed a little above centre, so that Instagram's caption does not cover it.
6. As the owner, I want the Reel to be the whole beat, so that I can cut any 30 seconds in Instagram's editor.
7. As the owner, I want changing the Cover Style to re-render the Reel too, so that it always matches the YouTube video.
8. As the owner, I want sending to YouTube not to wait for the Reel, so that Instagram never slows the upload down.
9. As the owner, I want a Reel for a Beat made before this feature (it has audio and a cover), rendered when I first open the Instagram panel, so that old beats can go to Instagram too.
10. As the owner, I want no Instagram button on a Beat that has no audio or cover on disk (one only synced from the channel), so that I am not offered what cannot be made.
11. As the owner, I want an Instagram button on the Draft, Scheduled, Uploaded and Published Beat page, so that I can post before, with or after YouTube.
12. As the owner, I want the panel to show the Reel's Render progress while it renders, so that I know when the file is there.
13. As the owner, I want a "Show in folder" button that opens my file manager with the Reel selected, so that I can drag it into Instagram.
14. As the owner, I want the Instagram Post written the first time I open the panel, so that I do not pay for text I will not use.
15. As the owner, I want the panel to refuse to write while the title still has a Placeholder, and say so, so that the text is not built from an unfinished title.
16. As the owner, I want the written Instagram Post kept with the Beat, so that reopening the panel shows the same text.
17. As the owner, I want a "Write again" button, so that I can get another hook and caption when I do not like these.
18. As the owner, I want a copy button on every field, so that I paste each into Instagram in one click.
19. As the owner, I want the fields in the order Instagram's upload flow asks for them, so that I go top to bottom.
20. As the owner, I want a short on-screen hook, so that the static cover has something that stops the scroll.
21. As the owner, I want the caption's first line to hold the beat's name, its style, BPM and key, so that it is what people see before "more" and what Instagram search reads.
22. As the owner, I want the caption to carry the Beat's BeatStars link (added by code, never by the model) and no paragraph about the sound or "link in bio", so that the caption stays short and points at the beat itself. (Changed after QA on 2026-10-13.)
23. As the owner, I want exactly five or fewer hashtags, so that Instagram accepts the post.
24. As the owner, I want the hashtags mid-sized for the beat's style and artists plus my own, so that they put the Reel in the right category.
25. As the owner, I want the caption in English, so that it speaks to the same audience as YouTube.
26. As the owner, I want every artist the title names tagged by handle in the caption and listed for "Tag people", so that the Reel is tied to those artists.
27. As the owner, I want the panel to ask me for the handle of an artist I have not tagged before, so that the handle is right and I type it once.
28. As the owner, I want to mark a name from the title as a style, not an artist ("Guitar", "Reggaeton"), so that it is never asked about or tagged.
29. As the owner, I want my Artist Handles listed and editable in Settings, so that I can fix a wrong one.
30. As the owner, I want the Instagram Post to use the handles as they are when I open the panel, so that fixing a handle shows up without writing the text again.
31. As the owner, I want an audio name in the form "NAME (prod. delawer)", so that the Reel's sound is not "Original audio".
32. As the owner, I want alt text for the Reel, so that the post is accessible and described to Instagram.
33. As the owner, I want the publish time shown in my local time, the same as the YouTube one, so that I schedule the Reel for the same moment.
34. As the owner, I want a reminder to post it as a trial reel, so that I reach non-followers first.
35. As the owner, I want the Beat's BeatStars link in the panel, so that I can send it to people who comment.
36. As the owner, I want a "Posted on Instagram" switch in the panel, so that I record what I did by hand.
37. As the owner, I want a mark on posted Beats in the Library, so that I can see at a glance which beats are on Instagram.
38. As the owner, I want a clear message when `claude` is missing or not logged in, so that I know what to fix (the same as Fill from title).

## Implementation Decisions

**Reel rendering (core, ADR 0002).**
- `beat_upload/video.py` gains a Reel next to the YouTube video: a pure filter-graph builder
  for the 1080x1920 frame (cover scaled to 1080 wide, painted by the existing Cover Style
  graph, Label overlaid top right of the cover as `cover_graph` does, background = the styled
  cover scaled to fill, cropped, Gaussian-blurred, darkened, cover overlaid at
  `y = (H - h) / 2 - 120`), a `render_reel_cover` that writes one frame, and
  `render_reel(audio, image, output, on_progress, style)` that loops it over the audio with
  the same encoder as `render_video`. Prototype filter, approved by the owner:

  ```
  [0:v]scale=1080:{h}:flags=lanczos,format=rgb24[fit];
  {cover_style_graph(style, 'fit', 'styled', (1080, h))};
  [styled]split[a][b];
  [a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,
     gblur=sigma=40,eq=brightness=-0.25[bg];
  [b][1:v]overlay=x=W-w-{margin}:y={margin}:format=rgb[marked];
  [bg][marked]overlay=x=0:y=(H-h)/2-120[out]
  ```

  A cover taller than 9:16 at 1080 wide is scaled to fit the frame height instead.
- File name `reel.mp4` in the Beat's directory, a constant beside `VIDEO_FILENAME`.

**Reel Job.**
- New `JobKind.REEL`, its own runner in the pipeline service. It renders into a `.part` file
  and moves it over only if the Beat's Cover Style is still the one it rendered, as
  `run_render` does. It runs for a Beat in any status that has audio and cover on disk.
- Enqueued wherever a RENDER is enqueued for a Draft (new Draft from a Bounce Folder or files,
  Cover Style change), and by the panel when the Beat has no current Reel. Never enqueued
  twice while one is waiting. The upload never waits for it.
- Schema: `beats.reel_path` (nullable), `beats.reel_style` (nullable CoverStyle); a
  `reel_is_current` property mirroring `video_is_current`.

**Instagram Post.**
- Schema: `beats.instagram_post` (JSON, nullable): `hook`, `caption_body`, `hashtags`
  (list), `audio_name`, `alt_text`; `beats.instagram_posted` (bool, default false). Alembic
  migration.
- An `InstagramService` in `beat_server/services/` with the same runner seam as
  `FillService` (`run_claude(prompt, schema)`, injected so tests use a fake). `write(beat)`
  refuses a title with a Placeholder (`ConfigError`) and a title `parse_youtube_title` cannot
  read; builds a prompt from the title, BPM, key, moods and instruments, the "sentence about
  the sound" in the YouTube description, the YouTube hashtags and the rules above; validates
  the answer (hook ≤ 60 characters, at most five hashtags without `#` duplicates or spaces,
  no `@` in anything the model wrote) and raises `FillError` on a bad answer; saves it.
- The full caption is assembled by code, not by the model: body, then the line of `@handles`
  for the title's artists that have one, then the hashtags. So handles are always the
  owner's and a handle fixed in Settings shows up without a new write. Instagram's caption
  limit (2200 characters) is checked on the assembled text.
- Artists come from `parse_youtube_title(...).artists`.

**Artist Handles.**
- Stored as one Setting (`artist_handles`, JSON object): artist name (case-insensitive key)
  → handle without `@`, or `null` for a name the owner marked a style. A name missing from
  the map is "unknown": the panel asks for its handle with a "style, not an artist" option.
- Settings API returns and accepts the map; the Settings page lists it, editable.

**API.** (OpenAPI regenerated with `npm run api`.)
- `GET /api/beats/{id}/instagram` → Reel state (ready / rendering with Job / not possible),
  the Instagram Post assembled for display or `null`, unknown artists, the publish time
  (`publish_at` or the scheduled/published time), the BeatStars link, `posted`. Enqueues the
  Reel Job if the Beat has none current.
- `POST /api/beats/{id}/instagram` → writes (or writes again) the Instagram Post.
- `PUT /api/beats/{id}/instagram/posted` → sets the switch.
- `POST /api/beats/{id}/reel/show` → opens the file manager with the Reel selected:
  `org.freedesktop.FileManager1.ShowItems` over D-Bus (`gdbus call`), falling back to
  `xdg-open` on the directory. A browser cannot open `file://` from the app's page, so the
  server does it, as the local owner (ADR 0001's local-first deployment).
- `BeatOut` carries `instagram_posted` for the Library mark.

**Web.**
- `features/beat`: an Instagram button on the Draft and Published Beat pages (hidden without
  audio and cover); an Instagram panel built from existing Design System classes; anything
  missing goes into `design/ds/` (ADR 0005). Fields in Instagram's order, each with copy.
- Unknown artists appear at the top of the panel as small handle inputs; saving one updates
  the Setting and re-reads the panel.
- Library: a small "IG" mark on posted Beats in grid and list.
- Settings: an Artist Handles section.

## Testing Decisions

Test behaviour through public interfaces; no network, no ffmpeg, no real `claude`, no real
D-Bus.

- Reel filter graph: pure tests on the graph string and the frame geometry (cover width,
  vertical offset, tall covers), as `tests/test_video.py` tests `cover_graph` and
  `fit_in_frame`.
- Reel Job: with `render_reel` faked, as `tests/server/test_pipeline.py` fakes
  `render_video`: enqueued on a new Draft and on a Cover Style change, runs for a Published
  Beat, drops a render whose style is stale, does not block the upload.
- `InstagramService`: with a fake runner, as the Fill from title tests do: refuses a
  Placeholder title; rejects six hashtags or an `@` from the model; saves the answer.
- Caption assembly: pure; handles inserted from the map, styles and unknown artists left
  out, a changed handle shows up, length limit enforced.
- API: `GET` enqueues a Reel Job once, `POST` writes, `posted` toggles, `show` calls a faked
  opener with the Reel's path.
- Web (vitest): the panel shows fields and copy buttons, asks for unknown handles, shows Reel
  progress; the Library mark.

## Out of Scope

- Posting to Instagram through any API, or scheduling it from the app.
- Choosing the snippet or rendering a 30-second cut; the owner cuts in Instagram.
- On-screen text burned into the Reel; the owner adds the hook in Instagram's editor.
- TikTok, Stories, carousels, the profile (bio, links, grid).
- Instagram statistics.

## Further Notes

- Linux-only "Show in folder" is fine: the app runs on the owner's machine (ADR 0007).
- The writing costs one `claude` call of about 15 seconds per Beat, as Fill from title does.
- Suggested to the owner, not built: add YouTube as a second link in the Instagram profile.
