import { Link } from "react-router";
import { formatViews } from "@/lib/format";
import { jobState, percentOf } from "./filters";
import type { Beat } from "./queries";
import { STATUS_BADGE, STATUS_LABEL } from "./status";

type Badge = { text: string; className: string };

/** The corner badge on every cover: the Beat status, or "Failed" when its Job failed. */
export function cardBadge(beat: Beat, failed: boolean): Badge {
  if (failed) return { text: "Failed", className: "badge badge-failed" };
  return { text: STATUS_LABEL[beat.status], className: STATUS_BADGE[beat.status] };
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
        <span className={badge.className} data-status={beat.status}>
          {badge.text}
        </span>
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
