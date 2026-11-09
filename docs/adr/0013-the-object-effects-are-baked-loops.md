---
status: accepted
date: 2026-11-09
---

# The object Effects are baked loops; the Reel is ffmpeg again

The ray-marched objects (Crown, Chain, Gem) turn in steady studio light and do not react to
the beat (the owner dropped every kick flash and camera jolt on 2026-11-09). Their frames
therefore depend on nothing but time, and drawing them through SwiftShader for every Reel
(25-30 minutes a beat at half shader size, 40 at full) buys nothing. Each is drawn once
instead: `beat-upload bake` renders a 24-second loop at full quality (2x2 supersampling) into
the data dir (`bakes/<effect>[-<variant>].mp4`), and the REEL job plays it: ffmpeg loops the
clip for the whole beat, lays the header (title, artists, BPM, key) over it and adds the audio.
A minute of work, and the owner can post a beat the day it is bounced.

To loop without a seam the Effect's motion is made periodic in bake mode (`window.__bake`):
every rate becomes a multiple of 2*pi/24, the chain's spin a whole number of half turns. The
header is left out of the bake and drawn by Pillow (`visual/header.py`) in the same font,
size and places as the JavaScript `tiny()`, so a baked Reel and an engine Reel look the same.
The gem's stone is chosen per Beat by its seed; five bakes, one per stone, keep that choice.

Rejected: baking frame sequences and playing them inside the engine (2D speed, but still
Chromium and still minutes); making every Effect react to the beat again so a bake would be
impossible (the owner wants the objects still). Effects that do react (Burst, Flow, Dagger
with its sparks, Doubloon) are not baked and render frame by frame as before.

## Consequences

- Motes and dust in the three Effects are not periodic: they jump once every 24 s. Judged
  invisible on faint particles; a bake with a visible seam is redone, not patched.
- A change to the geometry, light or motion of a baked Effect does nothing to Reels until
  `beat-upload bake --redo`; the registry comment and CLAUDE.md say so.
- A Reel from a bake carries no Clip: the object Effects ignore the cover anyway.
