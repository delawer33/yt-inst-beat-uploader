import { NavLink } from "react-router";
import type { Job } from "@/api/events";
import { useJobs } from "@/features/jobs/queries";
import { useBeats } from "@/features/library/queries";
import { useAuthStatus, type AuthStatus } from "@/features/settings/authQueries";

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

/** The one Job the foot shows: what is happening now, on which Beat, how far along. */
export type RunningJob = {
  label: string;
  /** 0-100, already rounded. */
  percent: number;
  /** The Beat the Job belongs to; null for a channel-wide Job (sync, stats). */
  title: string | null;
};

type Props = {
  beatCount: number | undefined;
  running: RunningJob | null;
  queuedCount: number;
  status: AuthStatus | undefined;
};

/** Presentational: the app chrome, built from the Design System's `.sidebar` classes. */
export function SidebarView({ beatCount, running, queuedCount, status }: Props) {
  return (
    <aside className="sidebar">
      <div className="brand">
        Beat<span className="dot">.</span>Upload
      </div>
      <NavLink className="nav-item" to="/" end>
        Library
        {beatCount !== undefined && <span className="count num">{beatCount}</span>}
      </NavLink>
      <NavLink className="nav-item" to="/settings">
        Settings
      </NavLink>
      <div className="sidebar-foot">
        {running && (
          <div className="foot-group" data-testid="running-job">
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
            {running.title && <div className="foot-note text-muted">{running.title}</div>}
            {queuedCount > 0 && (
              <div className="foot-note text-muted">Then: {queuedCount} queued</div>
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

/** Pick the Job the foot shows and count the ones waiting behind it. */
export function pickRunning(jobs: Job[] | undefined, titleOf: (beatId: string) => string | null) {
  const list = jobs ?? [];
  const job = list.find((j) => j.status === "running") ?? null;
  const queuedCount = list.filter((j) => j.status === "queued").length;
  const running: RunningJob | null = job && {
    label: KIND[job.kind],
    percent: Math.round(job.progress * 100),
    title: job.beat_id ? titleOf(job.beat_id) : null,
  };
  return { running, queuedCount };
}

export function Sidebar() {
  const beats = useBeats();
  const jobs = useJobs();
  const auth = useAuthStatus();
  const { running, queuedCount } = pickRunning(
    jobs.data,
    (beatId) => beats.data?.find((beat) => beat.id === beatId)?.title ?? null,
  );
  return (
    <SidebarView
      beatCount={beats.data?.length}
      running={running}
      queuedCount={queuedCount}
      status={auth.data?.status}
    />
  );
}
