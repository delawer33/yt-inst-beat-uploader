---
status: accepted
date: 2026-09-23
---

# Scheduled publishing is done by YouTube, not by our job queue

A Scheduled Beat is uploaded as `private` with `status.publishAt` set; YouTube itself flips it
to public at that time. To reschedule or cancel we update the same `status` part on the
existing video. Our service never runs a "publish now" step at the due time.

The alternative was a local `PUBLISH` Job with `not_before` set to the due time (the column
already exists for network retries), calling `set_privacy(public)` when the worker gets to it.
Rejected: the service runs on a laptop that sleeps and loses Wi-Fi, which is why the queue has
catch-up logic at all. A stats run that is six hours late is fine; a publish six hours late
defeats the feature. YouTube keeps the appointment whether or not the laptop is on, and the
video shows up as Scheduled in YouTube Studio, so both tools agree.

## Consequences

- Only a `private` video can be Scheduled (a YouTube rule). Unlisted plus a publish time is not
  offered anywhere in the UI.
- Sync must read `status.publishAt` to tell a Scheduled Beat from a merely uploaded one;
  `scheduled` is a Beat status derived from YouTube, like `published` is.
- After the due time the local status lags until the next sync. The scheduler enqueues a SYNC
  once per Scheduled Beat whose time has passed, so the badge catches up within a minute while
  the laptop is on, and never guesses.
- A publish time that has already passed when the upload actually runs is an error the user
  sees, not something we silently fix.
- `Job.not_before` stays what it is: retry backoff for transient failures.
