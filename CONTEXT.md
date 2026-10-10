# Beat Upload

Turns a beat (an audio track plus a cover image) into a YouTube video and publishes it,
then tracks how that video performs on the channel.

## Language

**Beat**:
One musical track with its cover art, tracked from the moment it enters the Library until
it is published and earning views. The unit everything else hangs off.
_Avoid_: Track, song, beat folder

**Beat Folder**:
The legacy on-disk form of a Beat: a directory holding exactly one audio file, one image and
a `config.yaml`. Accepted as an import source only; it is no longer where a Beat lives.
_Avoid_: Folder, project folder

**Bounce Folder**:
The folder the owner exports a finished beat into: one untagged WAV, one tagged MP3, one cover
image and optionally a `stems` folder. Its name (or the WAV's) carries the BPM, key, moods,
instruments and whether foreign samples are used; never the beat's name, which comes from
the title. A Draft made from it goes to YouTube and to BeatStars.
_Avoid_: Beat Folder, source folder, export

**BeatStars Track**:
A Beat's page for sale on BeatStars, made from its Bounce Folder when the owner sends it.
It goes public together with the video, or at the same scheduled time; a Beat sent as
private or unlisted gets none until the owner puts it on BeatStars later. The video's
description links to it. The Draft page shows what will go to it (title, tags and genres
made from the YouTube title, moods, instruments, samples, release) and says so when the
title cannot be read yet.
_Avoid_: Listing, store page, product

**Library**:
The full set of Beats known to the application — both the ones added here and the ones already
published on the channel before it existed.
_Avoid_: List, collection, catalogue

**Metadata**:
The title, description, tags, category and privacy of a Beat as YouTube will see them.
_Avoid_: Config, settings

**Render**:
Producing the video file from a Beat's audio and cover.
_Avoid_: Encode, convert, build

**Upload**:
Sending a rendered video to YouTube. Distinct from publishing: an uploaded video can still be
private.
_Avoid_: Post, push

**Publish**:
Making an uploaded video visible — moving its privacy to public, now or at a scheduled time.
_Avoid_: Release, go live

**Scheduled**:
The state of a Beat that is uploaded as private with a publish time that YouTube will honour
on its own. Neither the service nor the laptop needs to be running for it to go public; only
a private video can be Scheduled. Once YouTube makes it public it is Published.
_Avoid_: Delayed, pending, postponed, timed

**Draft**:
A Beat the owner has not yet sent to YouTube. Its Metadata is still editable. A Draft may
already be rendering or Rendered; that is the state of its Job, not of the Beat.
_Avoid_: New, pending, unsent

**Rendered**:
A Draft whose video file is ready in the Cover Style the owner chose, so sending it will
not wait for a Render. Choosing another Cover Style makes it un-Rendered until the new
Render is done.
_Avoid_: Encoded, prepared

**Queued**:
A Beat the owner has sent, waiting for its Upload. Still Queued while its Render finishes.
Metadata stays editable until the Upload starts.
_Avoid_: Sent, submitted

**Job**:
One unit of background work on a Beat (render, upload, publish, stats refresh) with a status
and a log. What the UI shows progress for. A Job says what is happening to a Beat right now;
the Beat's status says what the owner has done with it.
_Avoid_: Task, operation

**Template**:
The title, description and tags every new Beat starts from, kept in Settings. `{name}` in a
Template is the audio file's name; a Template may also carry Placeholders.
_Avoid_: Preset, default, boilerplate

**Placeholder**:
A `[[...]]` marker inside a Beat's Metadata standing for text that is not written yet: an
artist, the substyle, BPM, key, the sentence about the sound. A Beat with a Placeholder left
cannot be sent.
_Avoid_: Variable, marker, tag

**Fill from title**:
Writing a Draft's description and tags from its title: the Template gives the shape, the
title gives the artists and substyle, the audio file name gives BPM and key, and neighbouring
keywords are added for the recommendations. What the owner already wrote in place of a
Placeholder stays. "Artist" is whatever stands before "Type Beat" in the title, a name or a
style; a title names none, one or two, and the result follows.
For a Beat from a Bounce Folder the same call also matches the moods and instruments the
owner wrote in the folder's name (misspelled or in Russian) to the BeatStars lists: moods
first, topped up to three from the substyle; instruments only the owner's. A word outside
the lists is dropped.
_Avoid_: Autofill, generate, regenerate

**Cover Style**:
One of seven named looks a Render paints the cover in: the cover goes grey, its brightness
is cut into a few bands, each band gets one fixed colour and ink outlines go on top. Chosen
per Beat by the mood of the beat; the colours come from the Cover Style, not from the cover,
so every video on the channel reads as one series.
_Avoid_: Palette, filter, sepia, theme

**Label**:
The channel's own mark stamped on every cover during the Render, in the layout of the
Parental Advisory label: a black box with three lines, PRODUCED BY / DELAWER / YOU BETTER RUN,
top right. Always on, always black and white, drawn after the Cover Style so it keeps its
shape.
_Avoid_: Badge, watermark, logo, stamp, Parental Advisory

**Workspace**:
Everything belonging to one channel owner: their credentials, their Library, their files.
Today there is exactly one, local to the machine; the concept exists so there can be more.
_Avoid_: Account, user, profile

**Design System**:
The tokens, classes and component pages that define how Beat Upload looks. Lives in the
Claude Design project of the same name; the repository carries a mirror of it.
_Avoid_: Theme, styles, DS (in prose)

**Mockup**:
A screen drawn in the "Beat Upload UI mockups" Claude Design project. The source a screen is
built from; never a screen of the application itself.
_Avoid_: Design, prototype, wireframe
