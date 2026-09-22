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
    <JobStatus job={{ ...failed, status: "running", error: null }} onRetry={() => undefined} />,
  );

  expect(screen.getByRole("progressbar")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
