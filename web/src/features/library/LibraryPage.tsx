import { Link } from "react-router";
import { useJobs } from "@/features/jobs/queries";
import { BeatGrid } from "./BeatGrid";
import { BeatTable } from "./BeatTable";
import { EmptyLibrary } from "./EmptyLibrary";
import { countBeats, failedBeats, filterBeats, sortBeats, totalViews } from "./filters";
import { LibraryToolbar } from "./LibraryToolbar";
import { usePrefs } from "./prefs";
import { useBeats, type Beat } from "./queries";
import { useBeatDrop, type BeatDrop } from "./useBeatDrop";

/**
 * The Library (Mockups 1b, 1c, 1d): head with the counts, toolbar, then the grid or the
 * list. Dropping anywhere in the window creates a Draft and opens its page. What is
 * running lives in the sidebar, the sync in Settings.
 */
export function LibraryPage() {
  const beats = useBeats();
  const drop = useBeatDrop();

  if (beats.isPending) return <p className="text-muted">Loading…</p>;
  if (beats.error !== null) {
    return (
      <p role="alert" className="text-accent">
        {beats.error.message}
      </p>
    );
  }
  return <LibraryView beats={beats.data} drop={drop} />;
}

function LibraryView({ beats, drop }: { beats: Beat[]; drop: BeatDrop }) {
  const jobs = useJobs();
  const [prefs, setPrefs] = usePrefs();
  const failed = failedBeats(jobs.data);
  const shown = sortBeats(filterBeats(beats, prefs.filter), prefs.sort);

  // The shell wraps the route in `.page-body`; the Library owns its own gutters, because
  // the head and the toolbar run the full width of the page.
  return (
    <div className="-mx-6 -my-4 flex min-h-full flex-col">
      {beats.length === 0 ? (
        <EmptyLibrary drop={drop} />
      ) : (
        <>
          <div className="page-head">
            <h2>Library</h2>
            <span className="num text-muted" data-testid="library-counts">
              {beats.length} {beats.length === 1 ? "beat" : "beats"} ·{" "}
              {totalViews(beats).toLocaleString()} views
            </span>
            <Link className="btn btn-primary" to="/beats/new">
              New beat
            </Link>
          </div>
          <LibraryToolbar prefs={prefs} counts={countBeats(beats)} onChange={setPrefs} />
          {drop.error !== null && (
            <div className="page-body">
              <p role="alert" className="note">
                {drop.error}
              </p>
            </div>
          )}
          {prefs.view === "grid" ? (
            <BeatGrid beats={shown} failed={failed} drop={drop} />
          ) : (
            <BeatTable beats={shown} />
          )}
        </>
      )}
    </div>
  );
}
