import { NavLink } from "react-router";
import type { Job } from "@/api/events";
import { useJobs } from "@/features/jobs/queries";
import { useBeats } from "@/features/library/queries";
import {
  useAuthStatus,
  type AuthStatus,
} from "@/features/settings/authQueries";

/** What the sidebar foot says about the YouTube connection. */
const CONNECTION: Record<AuthStatus, string> = {
  connected: "Connected",
  expired: "Expired",
  not_connected: "Not connected",
  not_configured: "Not configured",
};

const KIND: Record<Job["kind"], string> = {
  render: "Rendering",
  upload: "Uploading",
  sync: "Syncing",
  stats: "Pulling stats",
};

/** Jobs that carry a Beat; the queue line counts only these (see `pickRunning`). */
const BEAT_KINDS: ReadonlySet<Job["kind"]> = new Set<Job["kind"]>([
  "render",
  "upload",
]);

/**
 * `GET /api/jobs` answers with the newest 50 Jobs (`beat_server/api/jobs.py`), so a full
 * page means there may be more behind it than we can see, and the queue line says "N+".
 */
export const JOBS_PAGE_LIMIT = 50;

/** The one Job the foot shows: what is happening now, on which Beat, how far along. */
export type RunningJob = {
  label: string;
  /** 0-100, already rounded. */
  percent: number;
  /** The Beat the Job belongs to; null for a channel-wide Job (sync, stats). */
  title: string | null;
};

/** How many Beats are waiting, and whether that number is only a floor. */
export type Queue = {
  /** Distinct Beats with a queued render or upload, within the Jobs we were given. */
  count: number;
  /** True when the Jobs list was full, so `count` is a floor rather than a total. */
  partial: boolean;
};

type Props = {
  /** Number of Beats; `undefined` while loading, `null` when the Library failed to load. */
  beatCount: number | null | undefined;
  running: RunningJob | null;
  queue: Queue;
  status: AuthStatus | undefined;
};

/** The Beat count slot always holds something, so a cold load does not reflow the nav. */
function beatCountLabel(beatCount: number | null | undefined): string {
  if (beatCount === undefined) return "…";
  if (beatCount === null) return "—";
  return String(beatCount);
}

/** Presentational: the app chrome, built from the Design System's `.sidebar` classes. */
export function SidebarView({ beatCount, running, queue, status }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        Beat<span className="dot">.</span>Upload
      </div>
      <NavLink className="nav-item" to="/" end>
        Library
        <span className="count num">{beatCountLabel(beatCount)}</span>
      </NavLink>
      <NavLink className="nav-item" to="/settings">
        Settings
      </NavLink>
      <div className="sidebar-foot">
        {(running || queue.count > 0) && (
          <div className="foot-group" data-testid="running-job">
            {running && (
              <>
                <div className="foot-line">
                  <span>
                    <span className="dot-live pulse">● </span>
                    {running.label}
                  </span>
                  <span className="num text-muted">{running.percent}%</span>
                </div>
                <div className="progress thin">
                  <i style={{ width: `${running.percent}%` }} />
                </div>
                {running.title && (
                  <div className="foot-note text-muted">{running.title}</div>
                )}
              </>
            )}
            {queue.count > 0 && (
              <div className="foot-note text-muted">
                {running ? "Then: " : "Waiting: "}
                {queue.count}
                {queue.partial ? "+" : ""}{" "}
                {queue.count === 1 && !queue.partial ? "beat" : "beats"} queued
              </div>
            )}
          </div>
        )}
        <div className="foot-group">
          <div className="foot-line">
            <span className="text-muted">YouTube</span>
            <span>{status ? CONNECTION[status] : "…"}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * Pick the Job the foot shows and count the Beats waiting behind it.
 *
 * The foot is about Beats, so a running render or upload is shown ahead of a channel-wide
 * sync or stats pull, and the queue counts only Beats with a queued render or upload — a
 * nightly stats Job is not something the owner is waiting on a Beat for. Distinct Beats, so
 * a Beat with both a queued render and a queued upload counts once.
 */
export function pickRunning(
  jobs: Job[] | undefined,
  titleOf: (beatId: string) => string | null,
) {
  const list = jobs ?? [];
  const runningJobs = list.filter((j) => j.status === "running");
  const job =
    runningJobs.find((j) => BEAT_KINDS.has(j.kind)) ?? runningJobs[0] ?? null;
  const waiting = new Set(
    list
      .filter(
        (j) => j.status === "queued" && BEAT_KINDS.has(j.kind) && j.beat_id,
      )
      .map((j) => j.beat_id as string),
  );
  const running: RunningJob | null = job && {
    label: KIND[job.kind],
    percent: Math.round(job.progress * 100),
    title: job.beat_id ? titleOf(job.beat_id) : null,
  };
  const queue: Queue = {
    count: waiting.size,
    partial: list.length >= JOBS_PAGE_LIMIT,
  };
  return { running, queue };
}

export function Sidebar() {
  const beats = useBeats();
  const jobs = useJobs();
  const auth = useAuthStatus();
  const { running, queue } = pickRunning(
    jobs.data,
    (beatId) => beats.data?.find((beat) => beat.id === beatId)?.title ?? null,
  );
  return (
    <SidebarView
      beatCount={beats.isError ? null : beats.data?.length}
      running={running}
      queue={queue}
      status={auth.data?.status}
    />
  );
}
