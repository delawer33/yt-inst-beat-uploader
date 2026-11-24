---
status: accepted
date: 2026-10-10
---

# Drafts come from a Bounce Folder read off the local disk

A new Draft is made from the path of a Bounce Folder: the server reads the WAV, the tagged
MP3, the cover and the stems from that path, and keeps reading them from there until the
BeatStars Track and the video are done. The browser drop of one audio file and one cover is
hidden from the UI; its endpoint stays.

This breaks ADR 0001 ("the frontend never reads the disk", nothing takes the owner's files
from outside the Workspace). We accepted it because the owner exports every beat into such a
folder anyway, a folder with stems is half a gigabyte, and the server runs on the same
machine as that folder. Uploading it through the browser would copy it for nothing.

## Consequences

- Moving or deleting a Bounce Folder before its Beat is sent breaks the Render or the
  BeatStars upload of that Beat.
- A hosted version needs another way in (a browser folder drop over the same API); the
  path field is the local-only front door.
