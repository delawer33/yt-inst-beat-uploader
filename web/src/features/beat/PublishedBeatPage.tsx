import { useState } from "react";
import { Link } from "react-router";
import type { Job } from "@/api/events";
import { JobHistory } from "@/features/jobs/JobHistory";
import { JOB_LABEL } from "@/features/jobs/job";
import { useJobs, useRetryJob } from "@/features/jobs/queries";
import { STATUS_LABEL, STATUS_TAG } from "@/features/library/status";
import { useSetPrivacy, type Beat, type PrivacyChange } from "@/features/library/queries";
import { DailyBars } from "@/features/stats/DailyBars";
import { useBeatStats, type DayPoint } from "@/features/stats/queries";
import { formatDate, formatDateTime, formatViews, serverDate, toDateTimeLocal } from "@/lib/format";
import { defaultPublishAt } from "./metadata";
import { PrivacySelect, type PrivacyChoice } from "./PrivacySelect";

/** A Beat that has left the owner's hands: Uploading, Uploaded, Scheduled or Published. */
export function PublishedBeatPage({ beat }: { beat: Beat }) {
  const jobs = useJobs(beat.id);
  const stats = useBeatStats(beat.id);
  const retry = useRetryJob();
  const setPrivacy = useSetPrivacy();

  return (
    <PublishedBeatView
      beat={beat}
      jobs={jobs.data ?? []}
      points={stats.data ?? []}
      jobsError={jobs.error?.message ?? retry.error?.message ?? null}
      statsError={stats.error?.message ?? null}
      statsPending={beat.youtube_id !== null && stats.isPending}
      onRetry={(id) => retry.mutate(id)}
      retryingId={retry.isPending ? (retry.variables ?? null) : null}
      onPrivacy={(change) => setPrivacy.mutate({ id: beat.id, ...change })}
      privacyPending={setPrivacy.isPending}
      privacyError={setPrivacy.error?.message ?? null}
    />
  );
}

type ViewProps = {
  beat: Beat;
  jobs: Job[];
  points: DayPoint[];
  jobsError?: string | null;
  statsError?: string | null;
  statsPending?: boolean;
  onRetry: (jobId: string) => void;
  retryingId?: string | null;
  onPrivacy: (change: PrivacyChange) => void;
  privacyPending?: boolean;
  privacyError?: string | null;
};

/**
 * Mockup 1f: the crumb with the status tag and the YouTube link, the cover beside the
 * locked Metadata and the counters, the daily views, then the Jobs of this Beat next to
 * the Metadata and — while it is Scheduled — the schedule controls.
 *
 * Left out for lack of API data: the BPM and the length of the audio, the "vs prior 7d"
 * deltas, lifetime watch time and average view (the per-day series only covers the
 * window), and attempt counters beyond what a Job records.
 */
export function PublishedBeatView({
  beat,
  jobs,
  points,
  jobsError = null,
  statsError = null,
  statsPending = false,
  onRetry,
  retryingId = null,
  onPrivacy,
  privacyPending = false,
  privacyError = null,
}: ViewProps) {
  const title = beat.title || "Untitled";
  const job = beat.active_job;

  return (
    <div className="flex flex-col gap-5">
      <div className="crumb">
        <Link to="/" className="text-muted">
          ← Library
        </Link>
        <span className="text-muted">/</span>
        <span>{title}</span>
        <span className={`tag ${STATUS_TAG[beat.status]}`} data-status={beat.status}>
          {STATUS_LABEL[beat.status]}
        </span>
        {beat.youtube_url !== null && (
          <a className="end num" href={beat.youtube_url} target="_blank" rel="noreferrer">
            {shortUrl(beat.youtube_url)} ↗
          </a>
        )}
      </div>

      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-7">
        <div className="cover">
          {beat.cover_url !== null && <img src={beat.cover_url} alt={`Cover of ${title}`} />}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="display">{title}</h1>
          <div className="file-meta">{facts(beat)}</div>
          <hr className="hr" />
          <dl className="grid grid-cols-3 gap-4">
            {[
              { label: "Views", value: beat.views },
              { label: "Likes", value: beat.likes },
              { label: "Comments", value: beat.comments },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="label">{label}</dt>
                <dd className="stat stat-lg" aria-label={label}>
                  {formatViews(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {job !== null && <CurrentJob job={job} />}

      {beat.youtube_id !== null &&
        (statsError !== null ? (
          <div className="note" role="alert">
            <div className="note-title">The daily views did not load</div>
            <span className="text-soft">{statsError}</span>
          </div>
        ) : statsPending ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <DailyBars points={points} />
        ))}

      <div className="grid grid-cols-2 gap-7">
        <JobHistory jobs={jobs} onRetry={onRetry} retryingId={retryingId} error={jobsError} />
        <Metadata
          beat={beat}
          onPrivacy={onPrivacy}
          pending={privacyPending}
          error={privacyError}
        />
      </div>
    </div>
  );
}

/** The one Job that is queued, running or paused on this Beat right now. */
function CurrentJob({ job }: { job: Job }) {
  const percent = Math.round(job.progress * 100);
  return (
    <div className="job" aria-live="polite">
      <div className="job-line">
        <span className="job-title">
          <span className="dot-live pulse">● </span>
          {JOB_LABEL[job.kind]}
        </span>
        <span className="time num">{job.status === "queued" ? "queued" : `${percent}%`}</span>
      </div>
      <div className="progress thin striped">
        <i style={{ width: `${percent}%` }} />
      </div>
      {job.message && <pre className="log clip">{job.message}</pre>}
    </div>
  );
}

/** The Metadata as YouTube now holds it: read-only, with the visibility beside it. */
function Metadata({
  beat,
  onPrivacy,
  pending,
  error,
}: {
  beat: Beat;
  onPrivacy: (change: PrivacyChange) => void;
  pending: boolean;
  error: string | null;
}) {
  const onYouTube = beat.youtube_id !== null;
  return (
    <div className="flex flex-col gap-3">
      <div className="section-head">
        <b>Metadata</b>
        <span className="text-muted">read-only · edit on YouTube</span>
      </div>
      <div className="text-soft whitespace-pre-wrap">{beat.description || "—"}</div>
      {beat.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {beat.tags.map((tag) => (
            <span key={tag} className="tag tag-neutral">
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="fact-row">
        <span className="text-soft">Category</span>
        <span>{categoryLabel(beat.category_id)}</span>
      </div>

      <div className="field">
        <label htmlFor="privacy">Visibility</label>
        {onYouTube ? (
          <PrivacyControl
            key={`${beat.privacy}|${beat.publish_at ?? ""}`}
            beat={beat}
            onChange={onPrivacy}
            pending={pending}
            error={error}
          />
        ) : (
          <div className="flex flex-col gap-1">
            <PrivacySelect
              id="privacy"
              aria-label="Privacy"
              value={beat.privacy}
              disabled
              onChange={() => {}}
            />
            <span className="drop-hint">Set on YouTube after upload.</span>
          </div>
        )}
      </div>
    </div>
  );
}

type PrivacyControlProps = {
  beat: Beat;
  onChange: (change: PrivacyChange) => void;
  pending?: boolean;
  error?: string | null;
};

/**
 * The visibility of an uploaded beat, like in YouTube Studio: one selector for Private,
 * Unlisted, Public and Scheduled. The first three apply on selection. Scheduled shows the
 * publish time (the current one on a Scheduled beat, else tomorrow at this hour) and a
 * Schedule button; only that button sends. Public on a Scheduled beat is the one
 * irreversible step, so it asks "Publish now?" first.
 */
export function PrivacyControl({ beat, onChange, pending = false, error = null }: PrivacyControlProps) {
  const current: PrivacyChoice = beat.status === "scheduled" ? "scheduled" : beat.privacy;
  const [picking, setPicking] = useState(false);
  const [publishAt, setPublishAt] = useState(() =>
    toDateTimeLocal(beat.publish_at ? serverDate(beat.publish_at) : defaultPublishAt()),
  );
  const scheduling = picking || current === "scheduled";
  const publishAtInvalid = Number.isNaN(new Date(publishAt).getTime());
  const publishAtIso = publishAtInvalid ? null : new Date(publishAt).toISOString();
  const unchanged =
    beat.publish_at !== null && publishAtIso !== null && publishAtIso === serverDate(beat.publish_at).toISOString();

  function onPick(choice: PrivacyChoice) {
    if (choice === "scheduled") {
      setPicking(true);
      return;
    }
    setPicking(false);
    if (choice === current) return; // changed their mind about scheduling; nothing to send
    if (current === "scheduled" && choice === "public" && !window.confirm("Publish now?")) return;
    onChange({ privacy: choice, publish_at: null });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <PrivacySelect
          id="privacy"
          aria-label="Privacy"
          value={scheduling ? "scheduled" : current}
          allowScheduled
          disabled={pending}
          onChange={onPick}
        />
        {error && (
          <span role="alert" className="text-accent">
            {error}
          </span>
        )}
      </div>
      {scheduling && (
        <div className="flex flex-col gap-2">
          <input
            id="publish_at"
            type="datetime-local"
            aria-label="Publish at"
            className="input"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            aria-invalid={publishAtInvalid || undefined}
          />
          <div className="job-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={pending || publishAtIso === null || unchanged}
              onClick={() => publishAtIso && onChange({ privacy: "private", publish_at: publishAtIso })}
            >
              Schedule
            </button>
          </div>
          <span className="drop-hint">
            Your local time. Stays private; YouTube makes it public at this time.
          </span>
        </div>
      )}
    </div>
  );
}

/** "Published 9 Sep 2026 · Public · metadata locked after upload". */
function facts(beat: Beat): string {
  const parts: string[] = [];
  if (beat.status === "scheduled" && beat.publish_at) {
    parts.push(`Publishes ${formatDateTime(beat.publish_at)}`);
  } else if (beat.published_at) {
    parts.push(`Published ${formatDate(beat.published_at)}`);
  }
  parts.push(beat.privacy[0].toUpperCase() + beat.privacy.slice(1));
  if (beat.synced_at) parts.push(`synced ${formatDateTime(beat.synced_at)}`);
  parts.push("metadata locked after upload");
  return parts.join(" · ");
}

/** "https://youtu.be/k9F2…" -> "youtu.be/k9F2…", short enough for the crumb. */
function shortUrl(url: string): string {
  const bare = url.replace(/^https?:\/\/(www\.)?/, "");
  return bare.length > 42 ? `${bare.slice(0, 41)}…` : bare;
}

function categoryLabel(id: number): string {
  return id === 10 ? "Music (10)" : String(id);
}
