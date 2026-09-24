import { Link } from "react-router";
import { formatViews } from "@/lib/format";
import { jobState, percentOf } from "./filters";
import type { Beat } from "./queries";

type Badge = { text: string; className: string };

/**
 * The corner badge, in precedence order: a failed Job first, then a Job waiting to start,
 * then a Draft whose video is already Rendered. A running Job shows the rail instead.
 */
export function cardBadge(beat: Beat, failed: boolean): Badge | null {
  if (failed) return { text: "Failed", className: "badge badge-failed" };
  const job = beat.active_job;
  if (job !== null) return job.status === "running" ? null : { text: "Queued", className: "badge" };
  if (beat.status === "queued") return { text: "Queued", className: "badge" };
  if (beat.status === "draft" && beat.rendered) return { text: "Rendered", className: "badge badge-ink" };
  return null;
}

export function BeatCard({ beat, failed = false }: { beat: Beat; failed?: boolean }) {
  const job = beat.active_job;
  const running = job !== null && job.status === "running" ? job : null;
  const badge = cardBadge(beat, failed);
  const title = beat.title || "Untitled";
  const card = `beat-card${job !== null ? " working" : ""}${failed ? " failed" : ""}`;

  return (
    <Link to={`/beats/${beat.id}`} className={card} aria-label={title}>
      <div className="cover">
        {beat.cover_url !== null && <img src={beat.cover_url} alt={`Cover of ${title}`} loading="lazy" />}
        {running !== null && (
          <div className="rail">
            <i style={{ width: `${percentOf(running)}%` }} />
          </div>
        )}
        {badge !== null && <span className={badge.className}>{badge.text}</span>}
      </div>
      <div className="beat-title" title={title}>
        {title}
      </div>
      <div className="beat-meta">
        {job !== null ? (
          <span className="state" aria-label="job">
            {jobState(job)}
          </span>
        ) : (
          <span className="views num" aria-label="views">
            {formatViews(beat.views)}
          </span>
        )}
      </div>
    </Link>
  );
}
