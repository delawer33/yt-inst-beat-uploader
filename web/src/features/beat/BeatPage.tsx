import { Link, useParams } from "react-router";
import { useBeat, type Beat } from "@/features/library/queries";
import { DraftBeatPage } from "./DraftBeatPage";
import { PublishedBeatPage } from "./PublishedBeatPage";

/** Draft and Queued are the owner's own; their Metadata is still editable (ADR 0004). */
const OWNERS: ReadonlySet<Beat["status"]> = new Set<Beat["status"]>(["draft", "queued"]);

/**
 * One Beat. Loads it and picks the view its status calls for: the Draft screen while the
 * owner is still editing, the read-only one once the Beat is on its way to YouTube.
 */
export function BeatPage() {
  const { id = "" } = useParams();
  const beat = useBeat(id);

  if (beat.isPending) return <p className="text-muted">Loading…</p>;
  if (beat.error) {
    return (
      <div className="flex flex-col gap-4">
        <div className="note" role="alert">
          <span className="note-title">That beat did not load</span>
          <span className="text-soft">{beat.error.message}</span>
        </div>
        <Link to="/">← Library</Link>
      </div>
    );
  }
  return OWNERS.has(beat.data.status) ? (
    // Keyed so a Draft-to-Draft navigation does not carry one Beat's mutations (a running
    // fill, its error) onto the next.
    <DraftBeatPage key={beat.data.id} beat={beat.data} />
  ) : (
    <PublishedBeatPage beat={beat.data} />
  );
}
