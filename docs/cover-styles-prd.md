# PRD: Cover Styles

Glossary: [CONTEXT.md](../CONTEXT.md). Decisions:
[ADR 0002](adr/0002-core-package-stays-web-and-db-free.md),
[ADR 0005](adr/0005-the-look-comes-only-from-the-design-system.md).

Status: decided with the owner on 2026-10-09, grilled and built the same day. Reference sheets and the prototype
are in `dev/cover-styles/` (gitignored: they use real covers).

## Problem Statement

Every Render puts the same 45 % sepia on the cover (`beat_upload/video.py`, `SEPIA_STRENGTH`).
The owner finds it sad and wants a look that is sharp like black and white and makes every
video on the channel read as one series, whatever cover goes in.

## Solution

Replace the sepia with a **Cover Style**: a gradient map plus ink outlines, in the manner of
JoJo's colour pages. The cover is turned grey, its brightness is cut into 3–5 bands, each band
is painted one fixed colour, and edge lines are multiplied on top. Because the colours come
from the Cover Style and not from the cover, any picture (cartoon, photo, dark or flat) comes out
in the same style. The owner checked this on five real covers: `palettes-1-4.png`,
`palettes-5-8.png`.

The owner picks one of seven Cover Styles per Beat, by the mood of the beat. They are fixed
in code; the recognisable part is the treatment (posterisation + ink), so rotating styles
keeps the channel's look. Default: `purple_yellow_5tone`.

Rough mood guide for the owner (not enforced): melodic and guitar beats → `stone_ocean`,
`purple_yellow_5tone`; dark and rage → `blood_3tone`, `golden_wind`.

## The Cover Styles

Bands are on the 0–255 grey value after `eq=contrast=1.3`; a value below the first cut gets the
first colour, and so on. Colours run from shadows to highlights.

| name | colours | cuts | ink |
|---|---|---|---|
| `purple_yellow_5tone` (default) | `1c0838 6b1c9e e0287a ffc61a d8fbff` | 45 95 150 205 | thin |
| `purple_yellow_thick_ink` | `230a46 c81e8c ffcd28 c8ffff` | 60 120 190 | thick |
| `golden_wind` | `1a0a2e b0153a f5c518 fff6d5` | 60 120 190 | thin |
| `dio_green` | `0d2b1a 6a1fa0 c8e632 fdfbd0` | 60 120 190 | thin |
| `diamond_pink_cyan` | `14123a ff3d9a 39d5e6 ffffff` | 60 120 190 | thin |
| `stone_ocean` | `06204a 1a8f9e a6e22e f0fff0` | 60 120 190 | thin |
| `blood_3tone` | `0a0a0a c1121f ffe8c2` | 80 170 | thin |

Rejected: the inverted (negative) mapping, too light and not trap; duotones and plain hue
shifts (`duotones.png`, the first row set of `first-gradient-maps.png`), because a hue shift
keeps the cover's own colours and the covers stop looking like one series.

## The ffmpeg recipe

As prototyped in `dev/cover-styles/prototype.py` (`gmap()`), per cover:

```
[0:v]<scale+pad>,split[a][b];
[a]format=gray,eq=contrast=1.3,format=rgb24,
   lutrgb=r='if(lt(val,45),28,if(lt(val,95),107,...))':g=...:b=...,format=gbrp[c];
[b]edgedetect=low=0.08:high=0.25,negate,format=gbrp[e];      # thin ink
   edgedetect=low=0.06:high=0.2,negate,erosion,format=gbrp    # thick ink
[c][e]blend=all_mode=multiply
```

Gotchas found while prototyping:

- Both blend inputs must be forced to `gbrp`. Otherwise ffmpeg negotiates grey for the whole
  graph and the result comes out black and white.
- Commas inside `lutrgb` expressions must be escaped (`\,`) in a filter graph.
- Apply the style before the letterbox pad, or the black bars get painted too: pad after, or
  map only the cover area.
- The prototype ran at 320 px. Check the edge thresholds and ink thickness on a full 1080p
  render before fixing the numbers; thin ink may need a lower threshold at that size.

## Where it touches the code

- `beat_upload/video.py`: `sepia_filter()` and `SEPIA_STRENGTH` give way to a pure
  `cover_style_filter(style)`; `render_video()` takes the style. `tests/test_video.py` has
  sepia tests to replace.
- A `CoverStyle` `StrEnum` in core; the Beat stores its style (DB column + alembic migration);
  `api/schemas.py`, then `npm run api`.
- Flow (grilled 2026-10-09): nothing changes on New Beat. The Render starts at once with the
  default Cover Style (ADR 0004). The picker lives on the Draft page; saving a different style
  throws the old `video.mp4` away and queues a new Render. The Beat records which Cover Style
  its `video.mp4` was rendered with (`video_style`), so a Render queued behind a running one
  re-renders instead of skipping, and an Upload never ships the old look. The style is
  editable while Draft only; Queued and later keep it.
- Existing Rendered Drafts keep their sepia `video.mp4` until the owner changes their style.
  Published Beats are untouched. Nothing is deleted on upgrade.
- The Label is always on, black and white, no per-Beat switch: a column later if ever needed.
- The Label is drawn with Pillow (new dependency) in a pure `beat_upload/label.py`, from the
  geometry in `pa_label_prototype.py`; ffmpeg `drawtext` cannot justify letters into equal
  gaps. League Gothic ships in the package with its OFL. The PNG goes in as a second ffmpeg
  input and is `overlay`ed after the Cover Style, before the pad.
- Draft form: a Cover Style picker with a live preview, code first, no Mockup. CSS cannot do a gradient map, so the
  preview `filter: sepia(.45)` in `design/ds/styles.css` (`.yt-frame img`), the note in
  `design/ds/readme.md` and the caption in `web/src/features/beat/YouTubePreview.tsx` go. The
  preview becomes a still the server renders with the same filter (one ffmpeg frame, cached
  per Beat and style). The picker is a new element; its classes go into `design/ds/` (ADR 0005).
- CLI: a `cover_style` key in `config.yaml`, default `purple_yellow_5tone`.
- The Label: a pure function that draws it (Pillow is not a dependency yet; either add it or
  rebuild the three lines with ffmpeg `drawtext` and `drawbox` using the measured geometry),
  applied in `render_video()` after the Cover Style and before the pad. The font ships with
  the package. The server-rendered preview shows it too.
- CONTEXT.md has **Cover Style** (one of the seven named looks, colours plus ink; "palette" is
  avoided) and **Label**.

## The Label on every cover

The owner wants the same mark on every cover, in the manner of the Parental Advisory label.
Decided on 2026-10-09; the notes below are the path there.

- The Parental Advisory label is an RIAA trademark. Type-beat channels use it widely and
  nobody seems to enforce it, but it says nothing about this channel, and some covers already
  carry it (the cat cover), so it would appear twice.
- An own mark does the same job and builds recognition: the producer name or logo as a stamp
  in a fixed corner, drawn in the Cover Style's lightest colour so it changes with the Cover Style.
- A JoJo option that fits the style: the 「ゴゴゴ」 "menacing" sound-effect lettering at one edge.
- Whatever it is, it goes on after the gradient map so it keeps its shape, and the owner
  should be able to switch it off per Beat.

**Current direction:** the owner rejected the designed badges below and wants the Parental
Advisory label itself, same layout and lettering, with own words. Mockup:
`dev/cover-styles/pa_closeup.png` (next to the real label), `pa_labels.png`,
`pa_label_prototype.py`. Three lines of equal width: a small top line with wide letter
spacing, a big middle word, a bottom line. Heights as a share of the label width, measured from
a real label: 0.095, 0.24, 0.13, gaps 0.055 and 0.047. Typeface: **League Gothic Regular**
(OFL, `dev/cover-styles/fonts/static/LeagueGothic-Regular.ttf`; ship it with the package),
unsquashed, and the leftover width of each line becomes equal letter gaps. Two forms: *open*
(white text straight on the cover) and *boxed* (black box, white band with the big word in
black). The open form disappears on light or busy covers, so use the boxed one.
**Decided by the owner: boxed form, PRODUCED BY / DELAWER / YOU BETTER RUN, top right,**
about 27 % of the cover width, margin 4 %. Top right is where the real Parental Advisory
label sits, so on covers that already carry one ours covers it and the label never appears
twice. The label goes on after the Cover Style, in plain black and white, on every Beat.

Earlier, rejected: mocked up on 2026-10-09 (`dev/cover-styles/badges.png`, `badge_prototype.py`): an own label
in the Parental Advisory layout, small line / big **DELAWER** / small line, in a bordered box,
about 30 % of the cover width, bottom right. Variants: A black and white; B the Cover Style's
darkest colour with its accent (yellow) for text and border; C a light box top left; D B plus
「ゴゴゴ」 down the left edge (yellow, thick dark outline; pink vanished on pink areas).
Recommended: B, with the box colours taken from the Beat's Cover Style so the label follows it.
Small lines tried: "PROD. BY" / "EXPLICIT BEATS", "MENACING BEATS", "TYPE BEAT" / "PURE TRAP".
Fonts in the mockup: Noto Sans ExtraCondensed Black (big line), Condensed Bold (small lines).
Draw the label with ffmpeg `drawbox` + `drawtext` or ship it as a pre-rendered PNG per
Cover Style and `overlay` it.
