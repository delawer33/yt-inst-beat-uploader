import type { Job } from "@/api/events";
import { serverDate } from "@/lib/format";
import type { Beat, BeatStatus } from "./queries";

export type Filter = "all" | "draft" | "queued" | "working" | "published";
export type Sort = "newest" | "views" | "status";
export type View = "grid" | "list";

export const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "queued", label: "Queued" },
  { id: "working", label: "Working" },
  { id: "published", label: "Published" },
];

export const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "views", label: "Views" },
  { id: "status", label: "Status" },
];

export const FILTER_IDS = FILTERS.map((f) => f.id);
export const SORT_IDS = SORTS.map((s) => s.id);
export const VIEW_IDS: View[] = ["grid", "list"];

/** Working means "has an active Job" — the Job says what is happening now. */
export function isWorking(beat: Beat): boolean {
  return beat.active_job !== null;
}

/**
 * The filters are not a partition: a Draft that is rendering counts under both Draft and
 * Working, because one says what the owner did and the other what is happening now.
 */
export function matches(beat: Beat, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "working":
      return isWorking(beat);
    default:
      return beat.status === filter;
  }
}

export function filterBeats(beats: Beat[], filter: Filter): Beat[] {
  return beats.filter((beat) => matches(beat, filter));
}

export function countBeats(beats: Beat[]): Record<Filter, number> {
  const counts = { all: 0, draft: 0, queued: 0, working: 0, published: 0 };
  for (const filter of FILTER_IDS) {
    counts[filter] = beats.filter((beat) => matches(beat, filter)).length;
  }
  return counts;
}

export function totalViews(beats: Beat[]): number {
  return beats.reduce((sum, beat) => sum + beat.views, 0);
}

const STATUS_ORDER: BeatStatus[] = [
  "draft",
  "queued",
  "uploading",
  "uploaded",
  "scheduled",
  "published",
];

const newestFirst = (a: Beat, b: Beat) =>
  serverDate(b.created_at).getTime() - serverDate(a.created_at).getTime();

/** Pure; never mutates the input list. Every sort falls back to newest first. */
export function sortBeats(beats: Beat[], sort: Sort): Beat[] {
  const list = [...beats];
  switch (sort) {
    case "views":
      return list.sort((a, b) => b.views - a.views || newestFirst(a, b));
    case "status":
      return list.sort(
        (a, b) =>
          STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || newestFirst(a, b),
      );
    default:
      return list.sort(newestFirst);
  }
}

const KIND_LABEL: Record<Job["kind"], string> = {
  render: "Rendering",
  upload: "Uploading",
  sync: "Syncing",
  stats: "Pulling stats",
};

/** What a Beat's active Job is doing, for the card's meta line: "Rendering 62%". */
export function jobState(job: Job): string {
  if (job.status === "running") return `${KIND_LABEL[job.kind]} ${percentOf(job)}%`;
  if (job.status === "paused") return `${KIND_LABEL[job.kind]} paused`;
  return `${KIND_LABEL[job.kind]} queued`;
}

export function percentOf(job: Job): number {
  return Math.round(job.progress * 100);
}

/**
 * Beats whose most recent Job failed. `active_job` only ever carries a pending Job, so a
 * failure has to come from the Job list itself.
 */
export function failedBeats(jobs: Job[] | undefined): Set<string> {
  const newest = new Map<string, Job>();
  for (const job of jobs ?? []) {
    if (job.beat_id === null) continue;
    const current = newest.get(job.beat_id);
    if (
      current === undefined ||
      serverDate(job.created_at).getTime() >= serverDate(current.created_at).getTime()
    ) {
      newest.set(job.beat_id, job);
    }
  }
  const failed = new Set<string>();
  for (const [beatId, job] of newest) if (job.status === "failed") failed.add(beatId);
  return failed;
}
