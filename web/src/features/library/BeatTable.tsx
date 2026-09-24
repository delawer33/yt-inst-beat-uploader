import { Link } from "react-router";
import { formatDate, formatViews } from "@/lib/format";
import type { Beat } from "./queries";
import { STATUS_LABEL, STATUS_TAG } from "./status";

/**
 * Mockup 1c, cut to the columns the API has per Beat. The 7d delta, Avg view and Watch
 * time columns of the mockup need the per-day series, which is a separate endpoint.
 */
export function BeatTable({ beats }: { beats: Beat[] }) {
  return (
    <div className="page-body">
      <table className="table">
        <thead>
          <tr>
            <th>
              <span className="sr-only">Cover</span>
            </th>
            <th>Beat</th>
            <th>Status</th>
            <th className="r">Views</th>
            <th className="r">Published</th>
          </tr>
        </thead>
        <tbody>
          {beats.map((beat) => {
            const title = beat.title || "Untitled";
            return (
              <tr key={beat.id}>
                <td>
                  <span className="thumb">
                    {beat.cover_url !== null && (
                      <img src={beat.cover_url} alt="" loading="lazy" />
                    )}
                  </span>
                </td>
                <td>
                  <Link to={`/beats/${beat.id}`}>{title}</Link>
                </td>
                <td>
                  <span className={`tag ${STATUS_TAG[beat.status]}`} data-status={beat.status}>
                    {STATUS_LABEL[beat.status]}
                  </span>
                </td>
                <td className="num r">{formatViews(beat.views)}</td>
                <td className="num r text-muted">{formatDate(beat.published_at) || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
