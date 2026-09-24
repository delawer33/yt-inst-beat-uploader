import type { Job } from "@/api/events";
import { serverDate } from "@/lib/format";

/** What a Job of each kind is called on screen. */
export const JOB_LABEL: Record<Job["kind"], string> = {
  render: "Render",
  upload: "Upload",
  sync: "Sync",
  stats: "Stats refresh",
};

export const JOB_STATUS_LABEL: Record<Job["status"], string> = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  paused: "Paused",
};

/** Design System `.tag` modifier per Job status. */
export const JOB_TAG: Record<Job["status"], string> = {
  queued: "tag-neutral",
  running: "tag-accent",
  done: "tag-neutral",
  failed: "tag-failed",
  paused: "tag-outline",
};

/** Queued with a delay: the worker is waiting out a network-retry backoff. */
export function isWaitingForRetry(job: Job): boolean {
  return job.status === "queued" && job.not_before !== null;
}

export function canRetry(job: Job): boolean {
  return job.status === "failed" || job.status === "paused" || isWaitingForRetry(job);
}

/** The whole log the API has of a Job: its message and, when it failed, its error. */
export function jobLog(job: Job): string {
  return [job.message, job.error].filter((part) => part).join("\n");
}

/** When the Job ran: "today 03:00" for today, else "22 Sep 03:00". Local time. */
export function jobWhen(job: Job, now: Date = new Date()): string {
  const at = serverDate(job.started_at ?? job.created_at);
  if (Number.isNaN(at.getTime())) return "";
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  if (at.toDateString() === now.toDateString()) return `today ${time}`;
  return `${at.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}

/** How long the Job took: "0.8 s", "2 m 31 s". Null while it has not finished. */
export function jobDuration(job: Job): string | null {
  if (job.started_at === null || job.finished_at === null) return null;
  const ms = serverDate(job.finished_at).getTime() - serverDate(job.started_at).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)} m ${String(Math.round(seconds % 60)).padStart(2, "0")} s`;
}
