import { JobList } from "@/features/jobs/JobList";
import { BeatGrid } from "./BeatGrid";
import { DropZone } from "./DropZone";
import { useBeats } from "./queries";

/**
 * Library: the Sync button and recent jobs (JobList), the DropZone for a new Beat, then
 * every Beat as a card.
 */
export function LibraryPage() {
  const beats = useBeats();
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Library</h1>
      <JobList />
      <DropZone />
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Beats</h2>
        {beats.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {beats.error && (
          <p role="alert" className="text-sm text-destructive">
            {beats.error.message}
          </p>
        )}
        {beats.data?.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No beats yet. Connect Google in Settings and press Sync to pull in your channel.
          </p>
        )}
        {beats.data && beats.data.length > 0 && <BeatGrid beats={beats.data} />}
      </section>
    </div>
  );
}
