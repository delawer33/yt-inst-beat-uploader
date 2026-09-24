import { useEffect, useState, type FormEvent } from "react";
import type { Job } from "@/api/events";
import { useJobs, useTriggerSync } from "@/features/jobs/queries";
import { formatDateTime } from "@/lib/format";
import { Field } from "./Field";
import { useSaveSettings, useSettings } from "./queries";

/** The nightly pull and the manual one both show up as these jobs. */
function isStatsJob(job: Job): boolean {
  return job.kind === "sync" || job.kind === "stats";
}

/** The last finished sync or stats job; the jobs list is newest first. */
export function lastRun(jobs: Job[] | undefined): Job | null {
  return jobs?.find((job) => isStatsJob(job) && job.finished_at !== null) ?? null;
}

/**
 * The Nightly stats settings row: the hour the pull runs at (local time), when it last ran,
 * and "Run now", which starts the same sync by hand and shows the job it made.
 */
export function NightlyStatsRow() {
  const settings = useSettings();
  const save = useSaveSettings();
  const jobs = useJobs();
  const sync = useTriggerSync();
  const [hour, setHour] = useState("");
  const stored = settings.data?.stats_hour;

  useEffect(() => {
    if (stored !== undefined) setHour(String(stored));
  }, [stored]);

  const last = lastRun(jobs.data);
  const running = sync.data
    ? (jobs.data?.find((job) => job.id === sync.data.id) ?? sync.data)
    : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate({ stats_hour: Number(hour) });
  }

  return (
    <section className="settings-row">
      <div className="what">
        <b>Nightly stats</b>
        <p>
          One pull per day builds the day-by-day history of every video. A run missed while the
          computer was asleep happens on the next start.
        </p>
      </div>
      <div className="how">
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          <div className="w-28">
            <Field label="Hour (0–23)" htmlFor="stats_hour">
              <input
                id="stats_hour"
                name="stats_hour"
                type="number"
                min={0}
                max={23}
                step={1}
                className="input num"
                value={hour}
                onChange={(e) => setHour(e.target.value)}
                required
                disabled={settings.isPending}
              />
            </Field>
          </div>
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={save.isPending || settings.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
          {save.isError && (
            <span role="alert" className="text-accent">
              {save.error.message}
            </span>
          )}
          {save.isSuccess && !save.isPending && <span className="text-muted">Saved.</span>}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted">
            local · last run {last ? formatDateTime(last.finished_at) : "never"} · pull from
            YouTube now:
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
          >
            {sync.isPending ? "Starting…" : "Run now"}
          </button>
        </div>

        {sync.isError && (
          <div className="note" role="alert">
            <span className="note-title">The sync did not start</span>
            <span>{sync.error.message}</span>
          </div>
        )}

        {running && (
          <div className="job" data-testid="sync-job" data-status={running.status}>
            <div className="job-line">
              <span className="job-title">Sync</span>
              <span className="time">{running.status}</span>
            </div>
            {running.message && <div className="job-line">{running.message}</div>}
            {(running.status === "queued" || running.status === "running") && (
              <div className="progress" aria-label="Sync progress">
                <i style={{ width: `${running.progress * 100}%` }} />
              </div>
            )}
            {running.error && (
              <div className="job-line" role="alert">
                {running.error}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
