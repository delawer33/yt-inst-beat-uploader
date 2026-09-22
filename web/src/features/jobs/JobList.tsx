import { Button } from "@/components/ui/button";
import { JobStatus } from "./JobStatus";
import { useJobs, useRetryJob, useTriggerSync } from "./queries";

/** Sync button plus the recent jobs; lives on the Library page until the beat pages own it. */
export function JobList({ beatId }: { beatId?: string }) {
  const jobs = useJobs(beatId);
  const retry = useRetryJob();
  const sync = useTriggerSync();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Jobs</h2>
        {!beatId && (
          <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            Sync
          </Button>
        )}
        {(sync.error ?? retry.error) && (
          <span role="alert" className="text-sm text-destructive">
            {(sync.error ?? retry.error)?.message}
          </span>
        )}
      </div>
      {jobs.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {jobs.error && (
        <p role="alert" className="text-sm text-destructive">
          {jobs.error.message}
        </p>
      )}
      {jobs.data?.length === 0 && <p className="text-sm text-muted-foreground">No jobs yet.</p>}
      <ul className="flex flex-col divide-y divide-border">
        {jobs.data?.map((job) => (
          <li key={job.id} className="py-2">
            <JobStatus
              job={job}
              onRetry={(id) => retry.mutate(id)}
              retrying={retry.isPending && retry.variables === job.id}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
