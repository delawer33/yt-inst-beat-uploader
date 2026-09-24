import { Fragment, useState } from "react";
import type { Job } from "@/api/events";
import {
  canRetry,
  isWaitingForRetry,
  jobDuration,
  jobLog,
  jobWhen,
  JOB_LABEL,
  JOB_STATUS_LABEL,
  JOB_TAG,
} from "./job";

type Props = {
  jobs: Job[];
  onRetry: (id: string) => void;
  retryingId?: string | null;
  error?: string | null;
};

/**
 * Everything that has happened to one Beat (Mockups 1f and 2a): a failed Job as a `.note`
 * with the log and the retry right there, then the history as a table whose log rows open
 * inline. `JobOut.message` / `.error` is the whole log — there is no log endpoint.
 */
export function JobHistory({ jobs, onRetry, retryingId = null, error = null }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const failed = jobs.filter((job) => canRetry(job) && job.status !== "queued");

  return (
    <div className="flex flex-col gap-2">
      <div className="section-head">
        <b>Jobs</b>
        <span className="text-muted num">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
          {failed.length > 0 && ` · ${failed.length} failed`}
        </span>
      </div>

      {error && (
        <div className="note" role="alert">
          <div className="note-title">The jobs did not load</div>
          <span className="text-soft">{error}</span>
        </div>
      )}

      {failed.map((job) => (
        <div className="note" role="alert" key={`failed-${job.id}`}>
          <div className="note-title">
            {JOB_LABEL[job.kind]} {job.status === "paused" ? "paused" : "failed"}
          </div>
          {jobLog(job) && <pre className="log">{jobLog(job)}</pre>}
          <div className="job-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={retryingId === job.id}
              onClick={() => onRetry(job.id)}
            >
              Retry {JOB_LABEL[job.kind].toLowerCase()}
            </button>
          </div>
        </div>
      ))}

      {jobs.length === 0 ? (
        <p className="text-muted">No jobs yet.</p>
      ) : (
        <table className="table">
          <tbody>
            {jobs.map((job) => {
              const log = jobLog(job);
              const shown = open === job.id;
              const duration = jobDuration(job);
              return (
                <Fragment key={job.id}>
                  <tr>
                    <td className="num text-muted">{jobWhen(job)}</td>
                    <td>{JOB_LABEL[job.kind]}</td>
                    <td>
                      <span className={`tag ${JOB_TAG[job.status]}`} data-status={job.status}>
                        {isWaitingForRetry(job) ? "Waiting" : JOB_STATUS_LABEL[job.status]}
                      </span>
                    </td>
                    <td className="num r text-muted">{duration ?? "—"}</td>
                    <td className="r">
                      {log && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-expanded={shown}
                          onClick={() => setOpen(shown ? null : job.id)}
                        >
                          {shown ? "Hide log" : "Show log"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {shown && (
                    <tr className="expand">
                      <td colSpan={5}>
                        <pre className="log">{log}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
