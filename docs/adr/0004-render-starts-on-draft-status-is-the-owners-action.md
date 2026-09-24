---
status: accepted
date: 2026-09-24
---

# Render starts when the Draft is created; a Beat's status is the owner's action, a Job is what is happening

Dropping a beat creates a Draft and immediately queues a Render Job. The owner fills in the
Metadata while the video is being produced, then sends the Beat: it becomes Queued at once,
and the Upload follows as soon as the Render is done. `rendering` is therefore not a Beat
status: the Beat stays Draft (or Queued) while its Job renders, and the UI shows the Job's
progress next to the status.

The alternative was the previous flow: Render and Upload as one chain started by the Upload
button, with the Beat walking `draft → queued → rendering → uploading`. With the render
starting early that chain would flip a Beat to `rendering` and back to `draft` while the owner
is still typing, which reads as a rollback in the Library and the history.

## Consequences

- A Draft may already be Rendered; the Library marks it so the owner knows sending is instant.
- Deleting a Draft can throw away a finished or running Render. Accepted: one minute of CPU.
- Metadata is editable while Draft or Queued and locks when the Upload starts.
