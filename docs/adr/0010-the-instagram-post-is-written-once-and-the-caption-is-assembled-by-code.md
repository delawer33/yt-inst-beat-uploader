---
status: accepted
date: 2026-10-13
---

# The Instagram Post is written once, and the caption is assembled by code

The Instagram Post (hook, caption body, hashtags, audio name, alt text) is written by the
local `claude` CLI through the runner Fill from title uses (ADR 0006), the first time the
owner asks for it in the Instagram panel, and kept on the Beat (`beats.instagram_post`,
JSON). Opening the panel again shows the same text; only "Write again" calls the model, and
it replaces the text. A `GET` never writes: the owner pays a call only for text they want.

The model writes the parts and the server checks them: a hook of at most 60 characters,
at most five hashtags without duplicates or spaces, no `@` anywhere. A bad answer is a
`FillError` and nothing is saved. The full caption is not the model's: code joins the body
and the hashtags (`assemble_caption`) and checks Instagram's 2200 characters. So the part
that must be exact (the limit, later the Artist Handles line) is never left to a prompt, and
a change to it needs no new model call.

The text is stored as the model's parts, not as one caption string, so the panel can show
each field with its own copy button and the caption can be re-assembled when its inputs change.

Artist Handles follow the same rule. They are one Setting (`artist_handles`: artist name in
lower case -> handle, or `null` for a style such as "Guitar"), asked in the panel for each
artist of the title the map does not know, and read at display time: `assemble_caption` puts
their `@handle` line after the body and the panel's "Tag people" field lists the same
handles. The model never sees or writes a handle, so fixing one in Settings changes the
caption with no new model call. The 2200-character limit is checked with the handle line, at
write time and at display time.

## Consequences

- A Beat's title must read (`parse_youtube_title`) and hold no Placeholder before the post is
  written; the panel shows the refusal instead.
- Unlike Fill from title the result is saved at once: there is no form where the owner reviews
  it first. The owner reads it in the panel and can write again.
