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

export function canRetry(job: Job): boolean {
  return job.status === "failed" || job.status === "paused";
}

type Props = {
  job: Job;
  onRetry?: (id: string) => void;
  retrying?: boolean;
};

export function JobStatus({ job, onRetry, retrying = false }: Props) {
  const failed = job.status === "failed";
  return (
    <div className="flex flex-col gap-1.5" data-testid="job-status" data-status={job.status}>
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium capitalize">{job.kind}</span>
        <span
          className={cn("text-muted-foreground", failed && "text-destructive")}
          aria-label="status"
        >
          {labels[job.status]}
        </span>
        {job.message && <span className="truncate text-muted-foreground">{job.message}</span>}
        {onRetry && canRetry(job) && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={retrying}
            onClick={() => onRetry(job.id)}
          >
            Retry
          </Button>
        )}
      </div>
      {(job.status === "running" || job.status === "queued") && (
        <Progress value={job.progress * 100} aria-label={`${job.kind} progress`} />
      )}
      {job.error && (
        <p role="alert" className="text-sm text-destructive">
          {job.error}
        </p>
      )}
    </div>
  );
}
