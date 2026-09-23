import { Link } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobList } from "@/features/jobs/JobList";
import { OverviewCard } from "@/features/stats/OverviewCard";
import { BeatGrid } from "./BeatGrid";
import { useBeats } from "./queries";

/**
 * Library: the "New beat" button (opens /beats/new), the Sync button and recent jobs
 * (JobList), the stats overview, then every Beat as a card.
 */
export function LibraryPage() {
  const beats = useBeats();
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Library</h1>
        <Button asChild>
          <Link to="/beats/new">
            <Plus aria-hidden="true" />
            New beat
          </Link>
        </Button>
      </div>
      <JobList />
      <OverviewCard />
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
            No beats yet. Press New beat to upload one, or connect Google in Settings and press
            Sync to pull in your channel.
          </p>
        )}
        {beats.data && beats.data.length > 0 && <BeatGrid beats={beats.data} />}
      </section>
    </div>
  );
}
