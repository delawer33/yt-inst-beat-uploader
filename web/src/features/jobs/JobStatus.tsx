import type { Job } from "@/api/events";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const labels: Record<Job["status"], string> = {
  queued: "Queued",
  running: "Running",
  done: "Done",
  failed: "Failed",
  paused: "Paused",
};

/** Queued with a delay: the worker is waiting out a network-retry backoff. */
export function isWaitingForRetry(job: Job): boolean {
  return job.status === "queued" && job.not_before !== null;
}

export function canRetry(job: Job): boolean {
  return (
    job.status === "failed" || job.status === "paused" || isWaitingForRetry(job)
  );
}

function retryTime(notBefore: string): string {
  // The server sends naive UTC without a zone suffix.
  return new Date(
    notBefore.endsWith("Z") ? notBefore : `${notBefore}Z`,
  ).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  job: Job;
  onRetry?: (id: string) => void;
  retrying?: boolean;
};

export function JobStatus({ job, onRetry, retrying = false }: Props) {
  const failed = job.status === "failed";
  const waiting = isWaitingForRetry(job);
  return (
    <div
      className="flex flex-col gap-1.5"
      data-testid="job-status"
      data-status={job.status}
    >
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium capitalize">{job.kind}</span>
        <span
          className={cn("text-muted-foreground", failed && "text-destructive")}
          aria-label="status"
        >
          {labels[job.status]}
        </span>
        {job.message && (
          <span className="truncate text-muted-foreground">{job.message}</span>
        )}
        {onRetry && canRetry(job) && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={retrying}
            onClick={() => onRetry(job.id)}
          >
            {waiting ? "Retry now" : "Retry"}
          </Button>
        )}
      </div>
      {(job.status === "running" || job.status === "queued") && (
        <Progress
          value={job.progress * 100}
          aria-label={`${job.kind} progress`}
        />
      )}
      {waiting ? (
        <p role="status" className="text-sm text-muted-foreground">
          Retry {job.attempts + 1} at {retryTime(job.not_before as string)}:{" "}
          {job.error}
        </p>
      ) : (
        job.error && (
          <p role="alert" className="text-sm text-destructive">
            {job.error}
          </p>
        )
      )}
    </div>
  );
}
