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

**Job**:
One unit of background work on a Beat (render, upload, publish, stats refresh) with a status
and a log. What the UI shows progress for.
_Avoid_: Task, operation

**Workspace**:
Everything belonging to one channel owner: their credentials, their Library, their files.
Today there is exactly one, local to the machine; the concept exists so there can be more.
_Avoid_: Account, user, profile
