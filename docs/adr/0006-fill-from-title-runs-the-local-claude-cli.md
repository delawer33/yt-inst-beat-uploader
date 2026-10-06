---
status: accepted
date: 2026-10-06
---

# Fill from title runs the local `claude` CLI, not an API key

Fill from title asks a language model to write a Draft's description and tags: it fills the
Template's Placeholders from the title, keeps what the owner already wrote, and adds
neighbouring keywords. The server runs `claude -p --output-format json --json-schema ...` as
a subprocess of the owner's user and reads the structured result. No key is stored, no HTTP
client is added, and the core package stays unaware (ADR 0002).

The alternatives were a deterministic substitution (no network, but it cannot pick adjacent
keywords or reshape the prose for one artist, which is what the owner was doing by hand for
every Beat) and the Anthropic API or an aggregator with a token in Settings (the owner has
no API key; a subscription is what exists, and a token would be one more secret to keep out
of the repository).

## Consequences

- The feature works only on a machine where `claude` is installed and logged in. The server
  reports a clear error otherwise; nothing else depends on it.
- One press costs a few seconds and a few cents of subscription quota. The call is
  synchronous: the result goes into the form, never straight into the database, so the owner
  sees it before the autosave takes it.
- The runner is one function; swapping the CLI for an API client later is a local change.
