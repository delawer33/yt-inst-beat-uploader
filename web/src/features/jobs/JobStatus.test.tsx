import { fireEvent, render, screen } from "@testing-library/react";
import type { Job } from "@/api/events";
import { JobStatus } from "./JobStatus";

const failed: Job = {
  id: "j1",
  beat_id: "b1",
  kind: "upload",
  status: "failed",
  progress: 0.3,
  message: "uploading",
  error: "The YouTube Data API rejected the upload",
  created_at: "2026-09-22T10:00:00",
  started_at: "2026-09-22T10:00:01",
  finished_at: "2026-09-22T10:00:05",
  attempts: 1,
  not_before: null,
};

test("a failed job shows its error and a Retry button", () => {
  const onRetry = vi.fn();
  render(<JobStatus job={failed} onRetry={onRetry} />);

  expect(screen.getByRole("alert")).toHaveTextContent("rejected the upload");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(onRetry).toHaveBeenCalledWith("j1");
});

test("a running job shows a progress bar and no Retry", () => {
  render(
    <JobStatus
      job={{ ...failed, status: "running", error: null }}
      onRetry={() => undefined}
    />,
  );

  expect(screen.getByRole("progressbar")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Retry" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("a job waiting for a network retry shows the schedule and a Retry now button", () => {
  const waiting: Job = {
    ...failed,
    status: "queued",
    error: "Could not reach YouTube",
    attempts: 2,
    not_before: "2026-09-22T10:30:00",
  };
  const onRetry = vi.fn();
  render(<JobStatus job={waiting} onRetry={onRetry} />);

  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent(
    /^Retry 3 at .*: Could not reach YouTube$/,
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry now" }));
  expect(onRetry).toHaveBeenCalledWith("j1");
});
