# Design: Bounce Folder → BeatStars → YouTube

Source: grill of 2026-10-10 (CONTEXT.md "Bounce Folder", "BeatStars Track"; ADR 0007).
Status: reviewed.

Flow:

```
path to Bounce Folder -> Draft (Render starts, nothing copied)
-> owner writes the title -> Fill from title (description, tags, + moods/instruments)
-> "Save & upload" -> Queued
   ├─ RENDER     (as today)
   └─ BEATSTARS  (only public / scheduled; Studio on workspace 11, release = YouTube's time)
-> whichever finishes last enqueues UPLOAD; {beatstars|...} in the description -> the link
```

## Slice 1: Studio probe

Research on the live Studio, no product code beyond one constants file.

**Write-set:** `beat_upload/beatstars/catalog.py` NEW.
**Depends on:** none.

Open a draft track (create one, delete it after) with the existing profile and record:

```python
# beat_upload/beatstars/catalog.py
MOODS: tuple[str, ...]         # the Mood list exactly as Studio spells it
INSTRUMENTS: tuple[str, ...]   # the Instrument list
GENRES: tuple[str, ...]
```

plus, in the slice's notes for slice 3: the instruments field's `data-qa`, and how a future
release date is set (control, time zone, what "Publish" turns into).

**Done when:** `catalog.py` holds the three lists; selectors for instruments and the release
date are written down.

## Slice 2: Bounce Folder in core

**Write-set:** `beat_upload/bounce_folder.py` NEW, `beat_upload/beatstars/package.py` EDIT,
`beat_upload/errors.py` EDIT, `tests/test_bounce_folder.py` NEW.
**Depends on:** none.

### Signatures

```python
# beat_upload/bounce_folder.py
"""104bpm_Amin_calm-rhytmic-mysterious_guitar-808_smp: parts before <n>bpm are dropped,
then key, then up to two '-'-joined word groups (moods, instruments), then optional smp."""

@dataclass(frozen=True)
class BounceFacts:
    bpm: int
    key: str                      # "Amin", same spelling as naming.py
    moods: tuple[str, ...]        # as the owner wrote them: ("calm", "rhytmic")
    instruments: tuple[str, ...]
    samples: bool

@dataclass(frozen=True)
class BounceFolder:
    folder: Path
    master: Path                  # the one .wav
    tagged: Path                  # the one .mp3
    cover: Path                   # the one image
    stems: Path | None            # the stems/ directory
    facts: BounceFacts

def parse_bounce_name(name: str) -> BounceFacts | None: ...   # None: no <n>bpm_<key> in it
def read_bounce_folder(folder: Path) -> BounceFolder: ...
    # facts from the folder name, else from the WAV's; BounceFolderError naming what is
    # missing or doubled (two .wav, no image, no bpm/key anywhere)

# beat_upload/beatstars/package.py
def sources_of(bounce: BounceFolder, work_dir: Path) -> TrackSources: ...
    # stems/ zipped (stored, not deflated: WAVs do not compress) into work_dir
def zip_stems(stems: Path, target: Path) -> Path: ...
```

`prepare_package` stays as is and takes these sources. The old `find_sources` /
`NAME_..._delawer` naming stays for the CLI.

### Test shape

```
test_bounce_folder.py
├─ "Jungle_104bpm_Amin_calm-rhytmic-mysterious" -> bpm 104, Amin, moods, no instruments
├─ "104bpm_Amin_calm_guitar-808_smp" -> instruments, samples
├─ "104bpm_Amin" -> no moods, no instruments
├─ "Jungle" folder, WAV "104bpm_Amin_dark.wav" -> facts from the WAV
├─ no bpm/key in folder or WAV -> BounceFolderError
├─ two .mp3 / no image -> BounceFolderError naming the file kind
└─ zip_stems: every file of stems/ in the zip, names flat
```

**Done when:** tests pass; `read_bounce_folder` on the Jungle folder returns the right files.

## Slice 3: Studio form: instruments, release date, resumable

**Write-set:** `beat_upload/beatstars/studio.py` EDIT, `beat_upload/beatstars/track.py` EDIT.
**Depends on:** slice 1.

### Signatures

```python
# track.py
@dataclass(frozen=True)
class BeatStarsTrack:
    ...                                   # existing fields
    instruments: list[str] = field(default_factory=list)   # up to 10, from INSTRUMENTS
    description: str = ""                 # no YouTube link any more for new tracks

def track_for_beat(youtube_title: str, facts: BounceFacts,
                   moods: list[str], instruments: list[str]) -> BeatStarsTrack: ...
    # title/tags/genres as track_from_youtube; description without the video

# studio.py
def publish_package(
    page: Page, package: TrackPackage, on_status: StatusFn,
    draft: str | None = None,
    publish: bool = True,
    release_at: datetime | None = None,         # None = now; aware UTC otherwise
    on_created: Callable[[str], None] = lambda _: None,   # the TK id as soon as it exists
) -> str: ...
```

### Call stack

```
publish_package()
├─ _create_track()          existing -> on_created(track_id)
├─ _fill_and_publish()
│  ├─ _set_chips(input_instrument)    NEW field
│  ├─ _set_release(page, release_at)  NEW, from slice 1 notes
│  └─ publish button                  existing; scheduled -> waits for the scheduled state
└─ check_public_page()      only when released now
```

**Done when:** a real track with instruments and a release date tomorrow shows as scheduled
in Studio (manual run, then deleted); `tests/test_beatstars.py` still passes.

## Slice 4: Draft from a Bounce Folder

**Write-set:** `beat_server/db/models.py`, new migration `0007_beat_bounce_folder.py`,
`beat_server/services/beats.py`, `beat_server/services/fill.py`, `beat_server/api/beats.py`,
`beat_server/api/schemas.py`, `tests/server/test_beats_bounce.py` NEW,
`tests/server/test_fill.py` EDIT.
**Depends on:** slice 2 (slice 1 for the catalog in the fill prompt).

### Data

```python
class Beat(Base):                     # new columns, all nullable / defaulted
    bounce_folder: Mapped[str | None]         # absolute path; ADR 0007
    bpm: Mapped[int | None]
    music_key: Mapped[str | None]             # "Amin"
    name_moods: Mapped[list[str]]             # as written in the name
    name_instruments: Mapped[list[str]]
    samples: Mapped[bool]
    beatstars_moods: Mapped[list[str]]        # matched to the catalog by Fill from title
    beatstars_instruments: Mapped[list[str]]
    beatstars_id: Mapped[str | None]          # "TK26393000", set as soon as Studio made it
    beatstars_url: Mapped[str | None]         # set when released / scheduled
    beatstars_skipped: Mapped[bool]           # "Upload without BeatStars"
```

`audio_path` / `image_path` hold absolute paths into the Bounce Folder for these beats;
`beat_dir / absolute` is the absolute path, so render, cover and preview work unchanged.

### Signatures

```python
# services/beats.py
def create_draft_from_folder(repo: BeatRepo, folder: Path, template: dict[str, Any]) -> Beat: ...
    # read_bounce_folder() -> Draft; audio = tagged mp3, image = cover; {name} -> ""

# api/schemas.py
class BounceIn(BaseModel):
    path: str

class BeatStarsPreview(BaseModel):     # what will go to BeatStars, read-only in the UI
    title: str
    tags: list[str]
    genres: list[str]
    moods: list[str]
    instruments: list[str]
    samples: bool
    release: Literal["with_video", "skipped_private", "skipped_by_owner"]
    error: str | None                  # the title does not parse yet, etc.
    track_id: str | None
    url: str | None

class BeatOut:  + beatstars: BeatStarsPreview | None    # None: not from a Bounce Folder
class BeatPatch: + beatstars_moods, beatstars_instruments: list[str] | None
class FillOut:  + beatstars_moods, beatstars_instruments: list[str]

# api/beats.py
@router.post("/from-folder", response_model=BeatOut, status_code=201)
def create_beat_from_folder(body: BounceIn, ...) -> BeatOut: ...   # + RENDER queued
```

Fill from title: BPM and key come from `beat.bpm` / `beat.music_key` when set (else
`audio_name_facts` as today). The prompt gets the name's moods and instruments and the
catalog; the schema adds `beatstars_moods` (3 to 5, the owner's first) and
`beatstars_instruments` (only the owner's, matched). Answers outside the catalog are dropped.

### Test shape

```
test_beats_bounce.py
├─ POST /from-folder with a tmp Bounce Folder -> 201, Draft, RENDER queued, facts stored
├─ POST /from-folder with no .wav -> 422 naming it, no row
├─ BeatOut.beatstars: title/tags from a valid title; error for "Untitled"
└─ release: public -> with_video; private no time -> skipped_private
test_fill.py
├─ bpm/key from the Bounce Folder facts in the prompt
└─ a mood outside the catalog in the answer is dropped
```

**Done when:** tests pass; `npm run api` regenerates without errors.

## Slice 5: BEATSTARS job and the link in the description

**Write-set:** `beat_server/db/models.py` (`JobKind.BEATSTARS`),
`beat_server/services/beatstars.py` NEW, `beat_server/services/pipeline.py`,
`beat_server/services/beats.py` (`metadata_of`), `beat_server/api/beats.py`,
`beat_server/app.py` (handler), `beat_upload/youtube.py` (`update_description`),
`tests/server/test_beatstars_job.py` NEW, `tests/server/test_pipeline.py` EDIT.
**Depends on:** slices 3, 4.

### The link

The description Template holds `{beatstars|DM @delawer33 on Instagram}`. The Beat keeps the
marker; `metadata_of` (validation and upload) swaps it for `beatstars_url`, or for the text
after `|` when there is none. Fill from title is told to leave the marker as it is.

```python
# services/beats.py
BEATSTARS_MARKER = re.compile(r"\{beatstars(?:\|(?P<fallback>[^}]*))?\}")
def with_beatstars_link(description: str, url: str | None) -> str: ...

# services/beatstars.py
def beatstars_due(beat: Beat) -> bool: ...
    # bounce_folder and not skipped and no url and (public or publish_at)
def ready_for_upload(beat: Beat) -> bool: ...
    # video current and (not beatstars_due(beat))
async def run_beatstars(ctx: JobContext) -> None: ...

# youtube.py
def update_description(video_id: str, metadata: YouTubeMetadata, credentials) -> None: ...
    # videos.update(part=snippet): title, description, tags, categoryId; 50 units

# api/beats.py
@router.post("/{beat_id}/skip-beatstars", response_model=BeatOut)   # Queued, BS failed
@router.post("/{beat_id}/beatstars", response_model=BeatOut)        # Put on BeatStars later
```

### Call stack

```
POST /upload (send)                         existing
├─ beatstars_due() -> enqueue BEATSTARS     NEW
└─ render / upload as today, but UPLOAD only if ready_for_upload()

run_beatstars()
├─ read_bounce_folder()        slice 2
├─ track_for_beat()            slice 3; moods/instruments from the beat, or exact name
│                              matches + moods_for_genre when Fill never ran
├─ prepare_package() into beat_dir/beatstars
├─ to_thread(studio + publish_package(draft=beat.beatstars_id,
│            release_at=publish_at, on_created=...))
├─ beat.beatstars_id / beatstars_url saved
├─ youtube_id set (Put on BeatStars later) -> update_description()
└─ QUEUED and ready_for_upload() -> enqueue UPLOAD

run_render()   end: QUEUED and ready_for_upload() -> enqueue UPLOAD   (was: video current)
```

Failures: a `BeatStarsError` fails the job, the Beat stays Queued. Retry (existing
`/jobs/{id}/retry`) resumes the same `beatstars_id` draft. "Upload without BeatStars" sets
`beatstars_skipped` and enqueues UPLOAD. A BEATSTARS job and a RENDER share the one worker;
the second waits.

### Test shape (fake studio, no browser)

```
test_beatstars_job.py
├─ public send: RENDER + BEATSTARS queued; UPLOAD only after both, link in the description
├─ private send: no BEATSTARS; description gets the fallback
├─ studio fails after creating TK1 -> job FAILED, beat Queued, beatstars_id TK1
├─ retry -> publish_package called with draft TK1
├─ skip-beatstars -> UPLOAD queued, fallback in the description
├─ scheduled beat -> release_at = publish_at
└─ Put on BeatStars on an Uploaded public beat -> update_description called with the link
test_pipeline.py
└─ render done while BEATSTARS still pending -> no UPLOAD yet
```

**Done when:** tests pass.

## Slice 6: Web

**Write-set:** `web/src/features/new-beat/NewBeatPage.tsx` (+test),
`web/src/features/beat/DraftBeatPage.tsx` (+test), `BeatStarsBlock.tsx` NEW,
`web/src/features/beat/PublishedBeatPage.tsx` (+test), `web/src/features/beat/queries.ts`,
`design/ds/` (only if a class is missing).
**Depends on:** slices 4, 5.

```
NewBeatPage        one field "Bounce Folder path" + Create; error note as today.
                   FileSlot / files.ts stay in the tree, unused.
BeatStarsBlock     read-only: title, tags, genres, moods, instruments, samples, release;
                   shows `error` instead when the title does not parse; link when there is one
DraftBeatPage      the block under Metadata; Fill writes moods/instruments into the form
Queued, BS failed  the failed Job's error + "Retry" + "Upload without BeatStars"
PublishedBeatPage  BeatStars link; "Put on BeatStars" when bounce_folder, no url,
                   Published or Scheduled
```

**Done when:** vitest passes; a real Bounce Folder makes a Draft in the running app.

## Slice 7: Headed browser from the service

**Write-set:** the user unit `beat-upload.service` (or a drop-in), README "Known state".
**Depends on:** slice 5.

The unit gets `WAYLAND_DISPLAY` (via `systemctl --user import-environment` in Hyprland's
autostart, or a drop-in); the Hyprland rule for class `beat-upload-beatstars` already sends
the window to workspace 11.

**Done when:** a BEATSTARS job started from the web opens Studio on workspace 11.

## Open questions

- None of product. Slice 1 may show that a scheduled release needs a time zone or a minimum
  lead time; slice 3 adapts to it.
