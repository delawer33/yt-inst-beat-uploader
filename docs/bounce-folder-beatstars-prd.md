# PRD: Bounce Folder → BeatStars → YouTube

Glossary: [CONTEXT.md](../CONTEXT.md) (Bounce Folder, BeatStars Track, Draft, Queued, Job,
Template, Fill from title). Decisions:
[ADR 0001](adr/0001-local-first-web-app-with-cloud-shaped-api.md) (broken on purpose, see
[ADR 0007](adr/0007-drafts-come-from-a-bounce-folder-on-local-disk.md)),
[ADR 0003](adr/0003-scheduled-publishing-is-done-by-youtube.md),
[ADR 0004](adr/0004-render-starts-on-draft-status-is-the-owners-action.md),
[ADR 0006](adr/0006-fill-from-title-runs-the-local-claude-cli.md).
Program design: [bounce-folder-beatstars-design.md](bounce-folder-beatstars-design.md).

## Problem Statement

The channel's beats are now for sale on BeatStars, and a video only sells when its
description links to the beat's BeatStars Track. Today that takes two separate tools run by
hand: the web app makes the YouTube video from an audio file and a cover dropped into the
browser; `beat-upload beatstars prepare` + `upload` make the BeatStars Track from a folder
whose files must follow a strict `NAME_95bpm_Cmin_..._delawer[_tagged].wav` naming. Then the
link has to be pasted into the YouTube description, which on Oct 10 2026 was done for 15
videos with a one-off script.

The owner already exports every beat into one folder: an untagged WAV, a tagged MP3, a cover
and a `stems` folder, the folder named like `Jungle_104bpm_Amin_calm-rhytmic-mysterious`. Every
fact both platforms need is in that folder; the only thing missing is the title, which the
owner writes on the Beat page anyway.

The owner also writes moods in English as they come to mind ("rhytmic"), not from BeatStars'
fixed list, and has no instruments on the BeatStars Tracks at all.

## Solution

The owner pastes the path of a Bounce Folder into New beat. A Draft appears with its Render
running. The owner writes the title and presses Fill from title: the description and tags
are written as today, and the moods and instruments from the folder name are matched to
BeatStars' lists (moods topped up to three). A read-only BeatStars block on the Beat page
shows exactly what will go to BeatStars.

"Save & upload when rendered" now first puts the beat on BeatStars, in the browser window
that opens on workspace 11, released at the same moment as the video (now, or at the
scheduled time). Then the video is uploaded with the BeatStars link in its description. A
beat sent as private or unlisted skips BeatStars and carries the DM line instead.

If BeatStars fails, the owner sees it on the Beat page and either retries (the same Studio
draft is continued) or uploads to YouTube without BeatStars. A beat that reached YouTube
without a BeatStars Track can be put on BeatStars later; its YouTube description then gets
the link.

## User Stories

1. As the owner, I want to create a Draft by pasting the path of a Bounce Folder, so that I do not pick files one by one.
2. As the owner, I want the WAV, the MP3, the cover and the stems folder found by their kind, so that I do not have to rename exports.
3. As the owner, I want BPM, key, moods, instruments and the samples mark read from the folder name, so that I write them once, where I already name things.
4. As the owner, I want the WAV's name used when the folder name carries no facts, so that either place works.
5. As the owner, I want whatever stands before the BPM in the name ignored, so that an old name like `Jungle_104bpm_...` still works.
6. As the owner, I want a clear error naming the missing or doubled file when the folder is wrong, so that I fix the export and try again.
7. As the owner, I want the Render to start as soon as the Draft exists, so that nothing changes in the flow I know (ADR 0004).
8. As the owner, I want the video rendered from the tagged MP3, so that the free version on YouTube carries my voice tag.
9. As the owner, I want my files read from where they are, without a copy, so that a half-gigabyte stems folder is not duplicated.
10. As the owner, I want Fill from title to take BPM and key from the Bounce Folder, so that the description has them without me typing.
11. As the owner, I want my mood words, misspelled or in Russian, matched to BeatStars' mood list, so that I never look the list up.
12. As the owner, I want moods topped up to three from the title's substyle when I wrote fewer, so that every BeatStars Track has moods.
13. As the owner, I want my own mood words to come first, so that the model does not overrule my ear.
14. As the owner, I want my instrument words matched to BeatStars' instrument list, and nothing invented, so that the instruments are true.
15. As the owner, I want a read-only BeatStars block on the Draft page with title, tags, genres, moods, instruments, samples and when it will be released, so that I see what goes out before I send.
16. As the owner, I want that block to tell me when the title cannot be read yet, so that I know why there is nothing to show.
17. As the owner, I want the BeatStars title, tags and genres made from my YouTube title the way the 15 old Tracks were, so that the store reads as one series.
18. As the owner, I want no YouTube link in the BeatStars description, so that the two links do not depend on each other.
19. As the owner, I want "Save & upload when rendered" to put the beat on BeatStars first, so that one button does both platforms.
20. As the owner, I want the BeatStars Track released at the same time as the video, so that the link works the moment the video is public.
21. As the owner, I want a scheduled video to give a BeatStars Track scheduled for the same moment, so that nothing goes public early.
22. As the owner, I want a private or unlisted send to skip BeatStars, so that a beat I am still unsure about stays off the store.
23. As the owner, I want the browser to open on workspace 11 and not in front of me, so that I keep working while it runs.
24. As the owner, I want to watch the BeatStars upload as a Job with progress, so that I see the files really went up.
25. As the owner, I want the YouTube description to get the BeatStars link in place of a marker in my Template, so that the link sits where my Template says.
26. As the owner, I want the marker to turn into my DM line when there is no BeatStars Track, so that the description never shows an empty spot.
27. As the owner, I want Fill from title to leave the marker alone, so that the link is not lost when I fill.
28. As the owner, I want a failed BeatStars Job to leave the beat Queued with the error shown, so that I decide what happens next.
29. As the owner, I want Retry to continue the same Studio draft, so that no duplicate track appears on BeatStars.
30. As the owner, I want "Upload without BeatStars" on a beat whose BeatStars Job failed, so that YouTube does not wait for BeatStars.
31. As the owner, I want "Put on BeatStars" on a Published or Scheduled beat that has none, so that I can catch up later.
32. As the owner, I want "Put on BeatStars" to write the link into the YouTube description, so that the video sells without me editing it.
33. As the owner, I want the BeatStars link shown on the Beat page once it exists, so that I can open the Track.
34. As the owner, I want the old two-file drop gone from New beat but still in the code, so that the page has one way in and nothing is lost.
35. As the owner, I want the render of another Draft to simply wait while a BeatStars Job runs, so that the one worker stays simple.
36. As the owner, I want the existing `beatstars prepare` / `upload` CLI to keep working, so that the old path is still there for odd cases.

## Implementation Decisions

- **Bounce Folder reader, in core.** A deep module that takes a path and returns the four
  files (WAV, MP3, cover, stems directory) and the facts (BPM, key, moods as written,
  instruments as written, samples). The name grammar: drop everything before `<n>bpm`, then
  key, then up to two `-`-joined word groups (moods, then instruments), then optional `smp`.
  Folder name first, WAV name second. Errors are a `BeatUploadError` subclass naming what is
  wrong. Lives in the web- and DB-free package (ADR 0002).
- **Track Package from a Bounce Folder.** The existing package builder (silence trim, square
  cover, preview cut at the same bar) takes sources built from a Bounce Folder; the stems
  directory is zipped without compression into the beat's own directory.
- **BeatStars catalog.** The fixed Mood, Instrument and Genre lists, copied from the live
  Studio once, kept as constants next to the Studio code.
- **Studio form.** Gains the instruments field, a release date (now or a future moment), and
  a callback with the track id as soon as Studio created it, so a failure can be resumed
  with the existing "finish this draft" path. The BeatStars description of new tracks drops
  the YouTube link.
- **Beat schema.** New nullable or defaulted columns: Bounce Folder path, BPM, key, moods
  and instruments as written, samples, matched moods and instruments, BeatStars track id,
  BeatStars URL, "skipped by owner". For these beats the audio and cover paths are absolute
  paths into the Bounce Folder (ADR 0007). One Alembic migration.
- **API.** A new create endpoint takes a path. The Beat as the API returns it gains a
  BeatStars preview (title, tags, genres, moods, instruments, samples, release mode, error,
  track id, URL), present only for beats from a Bounce Folder. The patch accepts matched
  moods and instruments. Fill's answer carries them too. Two new actions: skip BeatStars on
  a Queued beat, and put on BeatStars on an uploaded one. The frontend types are regenerated
  from OpenAPI.
- **Fill from title.** One `claude` call as today (ADR 0006); the structured output adds
  moods and instruments, which are checked against the catalog and dropped when outside it.
  BPM and key in the prompt come from the Bounce Folder facts. The prompt says to leave the
  BeatStars marker untouched.
- **The link.** The description Template holds `{beatstars|<fallback text>}`. The Beat keeps
  the marker; the step that validates and uploads Metadata swaps it for the BeatStars URL, or
  for the fallback when there is none. A beat that gets its Track later is re-sent to
  YouTube with `videos.update` on the snippet (50 quota units).
- **BEATSTARS Job.** A new Job kind. Due when the beat comes from a Bounce Folder, is not
  skipped, has no URL yet and goes public now or at a scheduled time. On send it is queued
  next to the Render; the UPLOAD is queued by whichever of the two finishes last. It builds
  the Track Package, drives Studio in a worker thread, saves the track id as soon as it
  exists and the URL at the end. When matched moods are missing (Fill never ran) it uses
  exact catalog matches of the written words plus the genre's default moods. A
  `BeatStarsError` fails the Job and leaves the beat Queued; the existing Job retry resumes
  the saved track id.
- **Web.** New beat becomes a path field with a Create button; the drop components stay in
  the tree unused. A read-only BeatStars block on the Draft page; the failed Job shows Retry
  and "Upload without BeatStars"; the published page shows the link or "Put on BeatStars".
  Every look comes from the Design System (ADR 0005); a missing class goes into `design/ds/`.
- **Service.** The user unit gets the Wayland environment so the headed Chromium can open;
  the existing Hyprland rule sends its window class to workspace 11.

## Testing Decisions

- Tests check behaviour through public interfaces: what a function returns, what the API
  answers, which Jobs are queued and what the Beat holds after; never private helpers.
- No network, no ffmpeg, no browser, no real config dir (CLAUDE.md); `tmp_path` for every
  folder; the Studio driver and the `claude` runner are replaced with fakes.
- Bounce Folder reader: name grammar cases, folder-vs-WAV precedence, wrong folders, stems
  zip. Prior art: `tests/test_beatstars.py` (naming and package without ffmpeg).
- Server: create from folder, BeatStars preview, Fill with facts and catalog filtering, the
  BEATSTARS Job ordering with Render and Upload, failure → Queued, retry with the saved
  track id, skip, put-on-BeatStars updating YouTube, the marker swap. Prior art:
  `tests/server/test_pipeline.py`, `tests/server/test_fill.py`.
- Web: vitest for the New beat path form, the BeatStars block and the new buttons. Prior
  art: `NewBeatPage.test.tsx`, `DraftBeatPage.test.tsx`, `PublishedBeatPage.test.tsx`.
- The Studio form changes are checked by one manual run against the live Studio (a track
  scheduled for tomorrow, deleted after); browser automation has no automated test.

## Out of Scope

- Editing BeatStars moods, instruments or tags on the Beat page (the block is read-only).
- A YouTube link in BeatStars descriptions, and back-filling the 15 old Tracks.
- Prices, licences, free download and monetization settings on BeatStars.
- A folder drop in the browser or a CLI command that creates a web Draft.
- Running BeatStars uploads in parallel with Renders.
- Instagram.

## Further Notes

- The description Template in Settings has to be edited once by the owner to carry the
  `{beatstars|...}` marker in place of the two DM lines.
- Studio has no public API and changes its form; the probe of the mood/instrument lists and
  of the release-date control is the first slice for that reason.
