# Beat Upload design system

The design system for Beat Upload and nothing else. It is Modernist (Archivo, one red, 0px radius, 2px rules, flush-left labels) with the ground inverted to dark, plus the product's own pieces: the beat card, the drop zone, jobs and progress, the side panel, the banner, the stats bars.

Source of truth for the look: `styles.css`. The mockups live in the "Beat Upload UI mockups" project; the code lives in `web/` of the app repo, where `src/styles/tokens.css` must carry the same values under the same names.

## How to use this

- Link the one stylesheet — `<link rel="stylesheet" href="styles.css">` — and take every color, font, size, spacing, radius, shadow and duration from its variables. Never hard-code a hex, a px or a ms the tokens already carry.
- Build with the classes below; view source on the component pages and copy the markup.
- To change the look, edit the tokens at the top of `styles.css` and keep `theme.json` and this guide in step.

## Direction

Dark ground, ink on it, one red. Everything sits on a visible grid with 2px rules between sections and 1px inside them. Labels are flush left, even in wide buttons. Numbers are tabular so columns line up. Cover art is in full color and is the only color on a page besides red — that is what makes the Library read at a glance.

**Red means exactly three things:** the primary action, work in progress, and anything that needs the user's hand (expired access, a failed job). Never decorative.

## Color

`--color-bg` #121110, `--color-surface` #1c1a19, `--color-surface-2` #2a2726 (hover fills, progress tracks), `--color-input` #161414, `--color-text` #f3f2f2, `--color-accent` #ec3013. Dividers are text at 26% (`--color-divider`) and 12% (`--color-divider-soft`). Muted text uses three fixed steps: 75%, 55%, 45%.

Both ramps (`--color-neutral-100…900`, `--color-accent-100…900`) are kept from Modernist. On this dark ground tinted fills use the **deep** steps: accent-900 fill with accent-300 text (`.tag-accent`, `.drop.active`); positive deltas and "days left" are accent-300.

## Type

Archivo everywhere, 800 for headings and stats, 600 for titles, 400 for body. Working size is 13px. Logs and file facts are 11px mono (`.log`, `.file-meta`). Scale: `.hero` 72, `h1` 44, `.display` 40, `h2` 28 (page titles), `h3` 24, `h4` 20 (drop titles), `h5` 15, body 13, small 12, `.label` 11 caps, badge 10. Put `.num` on every number.

## Layout

`.app` = 240px sidebar + page (+ 440px `.panel` when open). Page gutter 24px. `.page-head` → `.toolbar` (2px rule below) → `.page-body`. Radius is 0 everywhere. Elevation: `--shadow-sm/md/lg`, a hairline edge plus ambient darkness; `lg` is for panel, dialog and toast only.

## Motion

Nothing bounces, blurs or scales. 120ms hovers, 200ms state flips, 320ms panels, easing `cubic-bezier(.2,0,0,1)`. Progress changes linearly. The only thing that pulses is `.dot-live.pulse` on a working job. Entrances: `.enter-panel`, `.enter-banner`, `.enter-toast`, `.enter-card`.

## Interaction states

Hover and pressed come from the accent ramp (600 / 700) or a 7% / 14% ink tint. Keyboard focus is the 2px accent `:focus-visible` ring. Disabled drops to 45%. Selection is a 35% accent tint.

## Components

| Class | What it is | Shown in |
| --- | --- | --- |
| `.btn` + `.btn-primary / -secondary / -ghost / -inverse`, `.btn-sm`, `.btn-icon`, `.btn-block`, `.btn-flush` + `.trail`, `.btn-grow` | Actions; inverse is the white button inside the red banner | components/buttons.html |
| `.tag` + `.tag-outline` draft · `.tag-neutral` queued/uploaded/done · `.tag-accent` rendering/uploading · `.tag-ink` published · `.tag-failed` | Lifecycle status | components/buttons.html |
| `.dot-live` (+ `.pulse`), `.badge` (+ `-failed`, `-ink`) | The red dot; corner badge on a cover | components/buttons.html, beat-card.html |
| `.field` + `label` (+ `.counter`), `.input` (+ `.title`), `.tag-input`, `.input-row`, `.seg` (+ `.sm`, `.icon`) + `.seg-opt`, `.radio` + `.dot`, `.form-grid-2` | Forms on native elements | components/forms.html |
| `.beat-grid`, `.beat-card` (+ `.working`, `.failed`, `.selected-multi`), `.cover` + `.rail`, `.beat-title`, `.beat-meta` (`.views`, `.delta`, `.state`), `.thumb` (`.md/.lg/.xl`, `img` inside is cropped to fill) | The Library cell and its list twin | components/beat-card.html |
| `.drop` (+ `.active`, `.tile`, `.hero` — a block modifier, not the `.hero` type ramp), `.drop-title`, `.drop-hint` | Drop zone | components/dropzone.html |
| `.progress` (+ `.thin`, `.striped`), `.job` (+ `.failed`), `.job-line`, `.job-actions`, `.log` (+ `.clip`), `.queue-row` (+ `.running`, `.last`), `.section-head`, `.note` | Jobs, progress, logs, queue, inline error | components/jobs.html |
| `.sidebar`, `.brand`, `.nav-item` + `.count` (+ `.live`), `.sidebar-foot` + `.foot-group` / `.foot-line` / `.foot-note`; `.page`, `.page-head`, `.toolbar` + `.toolbar-end`, `.page-body`, `.page-foot`, `.dimmed` | App chrome | components/navigation.html |
| `.banner` + `.btn-inverse`; `.toast` (+ `.fixed`) | Needs-your-hand banner; ink toast | components/banner-toast.html |
| `.panel` (+ `.overlay`), `.panel-head` + `.meta`, `.panel-body`, `.panel-hero`, `.file-meta`, `.action-bar` | Beat side panel | components/panel.html |
| `.dialog-backdrop`, `.dialog`, `.dialog-head/-title/-sub/-body/-actions`, `.steps` + `.step` (`.done/.active/.todo`) + `.mark` | Modal with stepped progress | components/dialog.html |
| `.table` (+ `.r`, `.expand`) | Data tables, history | components/jobs.html, beat-card.html |
| `.settings-row` + `.what` / `.how`, `.account` | Settings | components/settings.html |
| `.stats`, `.stats-head`, `.bars` + `i` (`.peak`, `.partial`), `.bars-axis` | Daily bars | components/stats.html |
| `.card`, `.elev-sm/md/lg`, `.hr`, `.hr-soft` | Generic surface, elevation, rules | foundations/layout.html |
| `.crumb` (+ `.end`), `.split-form` + `.col-form` / `.col-preview`, `.fact-row`, `.yt-frame`, `.yt-meta`, `.yt-title`, `.tag-input .tag-entry` | The Draft screen: breadcrumb head, form beside the YouTube preview, fact rows, editable tag box | components/forms.html |

## Do

- Show the grid: 2px rules between sections, 1px inside.
- Keep labels flush left; put the arrow in `.trail`.
- Put errors where the user can act: a `.note` block with plain words, the raw log, and the buttons.
- Keep cover art in color.

## Don't

- No rounded corners, not even on tags.
- No red for decoration, hover, or charts beyond the one peak bar.
- No light theme yet (the segment in Settings says "soon" and is disabled).
- No smoothing, gridlines or gradients in charts.

## Files

- `styles.css` — tokens + component layer. The only stylesheet.
- `readme.md` — this guide. `theme.json` — the parameters, machine-readable. `theme.html` — the same, rendered.
- `thumbnail.html` — the project cover.
- `foundations/` — color, type, layout, motion.
- `components/` — buttons, forms, beat-card, dropzone, jobs, navigation, banner-toast, panel, dialog, settings, stats.
