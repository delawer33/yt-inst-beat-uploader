# PRD: Fill from title

Glossary: [CONTEXT.md](../CONTEXT.md) (Template, Placeholder, Fill from title). Decisions:
[ADR 0002](adr/0002-core-package-stays-web-and-db-free.md),
[ADR 0004](adr/0004-render-starts-on-draft-status-is-the-owners-action.md),
[ADR 0006](adr/0006-fill-from-title-runs-the-local-claude-cli.md).

## Problem Statement

Every new Beat starts from the owner's Template, whose description and tags are full of
Placeholders: `[[Artist1]]`, `[[Hard Trap]]`, `[[140]]`, a sentence about the sound. Filling
them is the same work on every Beat: copy the artists and substyle out of the title into a
dozen tags and three paragraphs, write the hashtags without spaces, drop everything about a
second artist when the title names one, add a few neighbouring keywords so YouTube's
recommendations have something to hang on. For the last six Beats the owner pasted the
Metadata into a chat with a language model and copied the answer back by hand.

It is also easy to get wrong. "New Night" went to YouTube with the Template's Placeholders
still in its description, because nothing stopped the send. And the Beat page can overwrite
what the server holds: the form is filled when the page opens but compares itself with the
live Beat, so any change that arrives from the server afterwards (a refetch after the Render,
a sync) reads as the owner's edit and is saved back as the old text.

## Solution

One button on the Beat page of a Draft, next to the title: **Fill from title**. It writes the
description and tags from the Template and the title, keeps whatever the owner already wrote
in place of a Placeholder (BPM, key, a mood), reads BPM and key from the audio file name when
it carries them, drafts the sentence about the sound, and adds neighbouring keywords to the
tags. The result lands in the form, where the owner sees it; the usual autosave keeps it.

Pressing again redoes the work against the current title without losing the owner's words.
The button is inactive while the title itself still holds a Placeholder and says so.

A Beat with a Placeholder anywhere in its Metadata cannot be sent: the send button is
inactive with the reason, and the server refuses too.

The Beat page stops overwriting the server: the form diffs against the Beat it was filled
from, not the live one, and adopts a server-side change to a field the owner has not touched.

## User Stories

1. As a channel owner, I want a Fill from title button on a Draft's Beat page, so that one press writes the description and tags I used to assemble by hand.
2. As a channel owner, I want the fill to follow my Template's wording and structure, so that every video reads the same way.
3. As a channel owner, I want the artists and the substyle taken from the title, so that the title is the only thing I type.
4. As a channel owner, I want a title with one artist to produce one block of artist tags and one artist hashtag, with no sentence left half-empty, so that I do not edit the prose afterwards.
5. As a channel owner, I want a title with no artist, only a style like "RnB Type Beat", to be filled as if the style were the artist, so that the tags and hashtags still make sense.
6. As a channel owner, I want BPM and key read from the audio file name when it is of the form `Dmin110`, so that I never type them.
7. As a channel owner, I want the original audio file name shown among the file facts on the Beat page, so that I still see it after I renamed the beat in the title.
8. As a channel owner, I want hashtags written without spaces and in lower case, so that YouTube treats them as hashtags.
9. As a channel owner, I want five to eight neighbouring keywords added to the tags after my Template's ones (related artists, adjacent styles), so that recommendations find the video.
10. As a channel owner, I want the tags kept within YouTube's 500 characters and free of angle brackets, so that the fill never produces Metadata the upload would reject.
11. As a channel owner, I want a draft sentence about the sound written for me, so that I only correct it after listening instead of writing it from nothing.
12. As a channel owner, I want what I already wrote in place of a Placeholder (BPM, key, a mood, the sound sentence) to survive a fill, so that pressing the button is never a loss.
13. As a channel owner, I want a second press to redo the artists and substyle from the current title, so that changing the title does not mean editing the description by hand.
14. As a channel owner, I want the button inactive while the title still holds a Placeholder, with a hint naming it, so that I fix the title first.
15. As a channel owner, I want the button inactive while the Beat is not a Draft, so that Metadata on its way to YouTube is never rewritten.
16. As a channel owner, I want the button to show it is working for the few seconds the fill takes, so that I do not press it twice.
17. As a channel owner, I want the filled text to appear in the form, not be saved behind my back, so that I see it before the Draft is saved.
18. As a channel owner, I want a clear note when the fill cannot run because the `claude` command is missing or not logged in, so that I know what to fix on the machine.
19. As a channel owner, I want a clear note when the fill fails or returns something YouTube would not take, with the form left as it was, so that a bad answer costs me nothing.
20. As a channel owner, I want "Save & upload when rendered" inactive while the title, description or tags hold a Placeholder, with the reason shown, so that a Template never reaches YouTube again.
21. As a channel owner, I want the server to refuse to send a Beat with a Placeholder, so that a second tab or a stale page cannot slip one through.
22. As a channel owner, I want a Draft with Placeholders to still be saveable, so that I can leave and come back.
23. As a channel owner, I want the Beat page to stop overwriting what the server holds with the form it opened with, so that a change that arrived from the server is not undone by the autosave.
24. As a channel owner, I want a field I have not touched to take the server's new value when the Beat is refetched, so that the page shows what is actually saved.
25. As a channel owner, I want a field I am editing to keep my text when the Beat is refetched, so that typing is never interrupted.

## Implementation Decisions

### Modules

- **Fill service** (server, new). The deep module. Input: a Draft, the owner's Templates, the
  audio file name. Output: a description and a list of tags, validated through the one
  Metadata validator so the limits are the same as everywhere else. It builds the prompt,
  runs the language model through a **runner**, parses the structured answer and validates
  it. The runner is a one-function dependency injected at construction, so the service is
  tested with a fake and the CLI is touched only by the real runner.
- **CLI runner** (server, new, thin). Runs `claude -p --output-format json --json-schema`
  as a subprocess of the owner's user with the schema for `{description, tags}`, a model
  pinned to a fast tier, a timeout of one minute, and turns "not installed", "not logged
  in", a timeout or a non-JSON answer into one `BeatUploadError` subclass with a message
  the owner can act on. The binary is found on `PATH` with the user's local bin as a
  fallback, since the service unit does not carry the login shell's `PATH`.
- **File name facts** (core, new, pure). `Dmin110`-style names give BPM and key; anything
  else gives nothing. Strict form only: `<note>[#|b]<min|maj><bpm>`.
- **Placeholder rule** (core, new, pure). "Does this Metadata still hold a `[[`"; used by the
  send guard on the server and mirrored by the frontend. Not part of the Metadata
  validator, because a Draft with Placeholders is legitimate to save.
- **Send guard** (server, existing send path). Refuses a Beat whose title, description or
  tags hold a Placeholder, as a state error with "fill the placeholders first".
- **Beat model and migration**. New column `source_name`: the original audio file name,
  recorded when the Draft is created, exposed on the Beat read model, shown among the file
  facts. Beats that predate the column have none; the fill then leaves BPM and key to the
  owner.
- **API**. `POST /api/beats/{id}/fill` returns `{description, tags}` and writes nothing.
  Not a Draft → the existing conflict error; title with a Placeholder → a validation error;
  runner failure → the error message the runner produced. Schema regenerated for the
  frontend.
- **Beat page** (frontend). The button under the Title field with its hint; a mutation that
  puts the answer into the form; a pure helper that names the Placeholders in the form,
  driving both the button's hint and the send guard; the send button's new disabled state.
- **Form baseline** (frontend, fix). The form keeps the Beat it was filled from as its
  baseline and diffs against that. When the live Beat changes, every field whose form value
  still equals the baseline adopts the new value and the baseline moves; a field the owner
  changed keeps the owner's text. This is a separate change, landed before the feature.

### Prompt contract

The model receives the title, the audio file name with the BPM and key already parsed when
present, the description and tags Templates, and the Beat's current description and tags. It
is told, in this order: the shape and wording come from the Template; Placeholders are filled
from the title; where the current text already holds the owner's words in place of a
Placeholder, those words stay; one artist means every tag, hashtag and sentence about the
second goes; no artist means the style before "Type Beat" plays the artist; the sentence
about the sound is drafted from the title and substyle; hashtags are lower case without
spaces; tags are the Template's artist blocks, then substyle, then five to eight neighbouring
keywords, within 500 characters total, no angle brackets. The answer is constrained by a JSON
schema with exactly `description` and `tags`.

The title is never rewritten; it is the owner's input.

### Interactions

- Pressing the button: the form's current description and tags are what the server sends to
  the model, so unsaved edits count. An armed autosave is cancelled first, as the other
  buttons do.
- The answer replaces the form's description and tags; the autosave then saves them like any
  edit. Nothing is written by the fill endpoint itself.
- The button is disabled while the request runs, while the title holds a Placeholder, and on
  anything that is not a Draft. The hint under it names the Placeholder in the title.
- The send button is disabled while any Placeholder remains, with a hint naming where.
- A failed fill leaves the form untouched and shows the message in the page's existing
  error note.

### Not changed

- The owner's Templates in Settings stay as they are; the model reads free-text Placeholders.
- The CLI and `config.yaml` know nothing about the fill.
- The core package gains two pure functions and no dependency.

## Testing Decisions

A good test drives a module through its public interface and asserts on what comes out, not
on how it got there. Nothing touches the network, ffmpeg, the real config dir or the real
`claude` binary.

- **Fill service** (pytest): with a fake runner, the prompt carries the title, the Templates,
  the current text and the parsed BPM and key; a valid answer comes back as description and
  tags; an over-long or bracketed answer is rejected with the validator's message; a runner
  error surfaces as the owner-facing message. Prior art: the pipeline tests with their
  injected fakes.
- **CLI runner** (pytest, subprocess faked): "not installed", "not logged in", timeout and
  bad JSON each give one clear message; a good JSON result is returned as a dict.
- **File name facts** (pytest, table-driven): `Dmin110`, `C#min123`, `Fmaj90` parse; `Lasso`,
  `110`, `Dm110` do not. Prior art: the config parsing tests.
- **Placeholder rule and send guard** (pytest): a Draft with `[[` in any of the three fields
  is refused on send with the message; a clean one goes through. Prior art: the beats API
  tests.
- **Migration** (pytest): the new column arrives through the Alembic path. Prior art: the
  existing migration test.
- **Fill endpoint** (pytest, runner overridden on the app): returns the pair, writes nothing,
  answers conflict for a non-Draft and a validation error for a title with a Placeholder.
- **Beat page** (vitest): the button's three disabled states and hint; a fill puts the answer
  into the form and the autosave patches it; the send button is disabled while a Placeholder
  remains; a failed fill leaves the form and shows the note. Prior art: the Draft page tests.
- **Form baseline** (vitest): a server-side change to an untouched field shows up and is not
  autosaved back; a field under edit keeps its text. This is the regression test for the
  overwrite.

## Out of Scope

- Any change to the title by the model.
- A "Reset to template" action.
- Changing the Templates' marker names or wording in Settings.
- Listening to the audio; the sound sentence is a draft from the title and substyle.
- Fill for Beats that are Queued, Uploaded, Scheduled or Published.
- Fill from the CLI or from `config.yaml`.
- An API key or an aggregator token in Settings (ADR 0006).

## Further Notes

- The overwrite fix is its own commit before the feature; it is what makes a server-side
  answer safe to put next to an open form.
- One press costs a few seconds and a little subscription quota. The model tier and timeout
  are constants on the runner, not Settings, until there is a reason.
- The hint texts: "Title still has [[Artist2]]" under the fill button; "Fill the placeholders
  in the description" (or tags, or title) under the send button.
