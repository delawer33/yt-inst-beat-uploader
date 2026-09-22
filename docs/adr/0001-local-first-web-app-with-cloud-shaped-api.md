---
status: accepted
date: 2026-09-22
---

# Local-first web app with a cloud-shaped API

The web UI runs as a local service on the owner's laptop (fixed port, starts with the
system), not as a hosted SaaS. But the HTTP API and the data model make no single-user
assumptions: everything owned by a channel owner sits behind a `Workspace`, of which there is
exactly one local implementation today.

We chose this over building multi-tenant from the start because publishing to other people's
channels requires Google's app verification (a security audit for the `youtube` scope, weeks of
lead time); paying that before anyone wants the product is buying an option we may never
exercise. We chose it over a plain local tool because the same code should later ship either as
a hosted service or as a desktop bundle (Tauri around the same SPA) without rewriting the
frontend.

## Consequences

- Nothing in the API takes "the user's files" or "the token" from a global; it goes through the
  Workspace.
- The frontend talks to the backend only over HTTP, never reads the disk or config directory.
- Google client id/secret are entered by the owner in Settings, not bundled: a bundled secret in
  a distributable leaks on day one.
