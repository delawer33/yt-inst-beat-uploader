import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { Job } from "@/api/events";
import { BeatCard } from "./BeatCard";
import type { Beat } from "./queries";

const beat: Beat = {
  id: "b1",
  status: "published",
  title: "Dark Trap Beat",
  description: "",
  tags: ["trap"],
  category_id: 10,
  privacy: "public",
  youtube_id: "abc123",
  youtube_url: "https://youtu.be/abc123",
  published_at: "2026-09-01T12:30:00",
  publish_at: null,
  views: 1234,
  likes: 12,
  comments: 3,
  has_files: false,
  rendered: false,
  active_job: null,
  cover_url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  synced_at: "2026-09-22T10:00:00",
  created_at: "2026-09-22T10:00:00",
  updated_at: "2026-09-22T10:00:00",
};

const render_job: Job = {
  id: "j1",
  beat_id: "b1",
  kind: "render",
  status: "running",
  progress: 0.62,
  message: "",
  error: null,
  created_at: "2026-09-22T10:00:00",
  started_at: null,
  finished_at: null,
  attempts: 0,
  not_before: null,
};

function renderCard(b: Beat, failed = false) {
  const router = createMemoryRouter([{ path: "/", element: <BeatCard beat={b} failed={failed} /> }]);
  return render(<RouterProvider router={router} />);
}

test("a card shows the cover, the title and the views, and links to the beat", () => {
  const { container } = renderCard(beat);
  expect(screen.getByText("Dark Trap Beat")).toBeInTheDocument();
  expect(screen.getByLabelText("views")).toHaveTextContent("1.2K");
  expect(screen.getByRole("link")).toHaveAttribute("href", "/beats/b1");
  expect(screen.getByRole("img", { name: "Cover of Dark Trap Beat" })).toHaveAttribute(
    "src",
    beat.cover_url,
  );
  expect(container.querySelector(".badge")).toBeNull();
});

test("a beat with a running job shows the rail and the job state instead of views", () => {
  const { container } = renderCard({ ...beat, status: "draft", active_job: render_job });
  expect(screen.getByLabelText("job")).toHaveTextContent("Rendering 62%");
  expect(screen.queryByLabelText("views")).not.toBeInTheDocument();
  expect(container.querySelector(".rail > i")).toHaveStyle({ width: "62%" });
  expect(container.querySelector(".beat-card")).toHaveClass("working");
});

test("a queued job, a rendered draft and a failed job each get their corner badge", () => {
  const queued = { ...render_job, status: "queued" as const };
  renderCard({ ...beat, status: "queued", active_job: queued });
  expect(screen.getByText("Queued")).toBeInTheDocument();

  renderCard({ ...beat, id: "b2", status: "draft", rendered: true, cover_url: null });
  expect(screen.getByText("Rendered")).toBeInTheDocument();

  const { container } = renderCard({ ...beat, id: "b3", status: "draft" }, true);
  expect(screen.getByText("Failed")).toBeInTheDocument();
  expect(container.querySelector(".beat-card")).toHaveClass("failed");
});

test("a beat without a cover or a title still renders", () => {
  renderCard({ ...beat, cover_url: null, title: "", views: 0 });
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("Untitled")).toBeInTheDocument();
  expect(screen.getByLabelText("views")).toHaveTextContent("0");
});
