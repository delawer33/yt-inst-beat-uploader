import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Beat } from "@/features/library/queries";
import { InstagramButton } from "./InstagramButton";
import { InstagramPanelView } from "./InstagramPanel";
import type { Instagram } from "./queries";

const beat: Beat = {
  id: "b1",
  status: "draft",
  title: "Ninety",
  description: "",
  tags: [],
  category_id: 10,
  privacy: "private",
  youtube_id: null,
  youtube_url: null,
  published_at: null,
  publish_at: null,
  views: 0,
  likes: 0,
  comments: 0,
  has_files: true,
  source_name: null,
  cover_style: "purple_yellow_5tone",
  video_style: null,
  rendered: false,
  active_job: null,
  cover_url: null,
  beatstars: null,
  beatstars_url: null,
  synced_at: null,
  created_at: "2026-10-13T10:00:00",
  updated_at: "2026-10-13T10:00:00",
};

const reel = (over: Partial<Instagram["reel"]>): Instagram["reel"] => ({
  state: "ready",
  progress: null,
  message: null,
  error: null,
  ...over,
});

const view = (r: Instagram["reel"] | null, props = {}) => (
  <MemoryRouter>
    <InstagramPanelView reel={r} onShow={vi.fn()} onClose={vi.fn()} {...props} />
  </MemoryRouter>
);

test("the Instagram button is hidden for a beat without audio and cover", () => {
  render(<InstagramButton beat={{ ...beat, has_files: false }} />);
  expect(screen.queryByRole("button", { name: "Instagram" })).not.toBeInTheDocument();
});

test("the Instagram button is there for a beat with its files", () => {
  render(<InstagramButton beat={beat} />);
  expect(screen.getByRole("button", { name: "Instagram" })).toBeInTheDocument();
});

test("while the Reel renders the panel shows progress and no Show in folder", () => {
  render(view(reel({ state: "rendering", progress: 0.42 })));
  expect(screen.getByText("42%")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Show in folder/ })).not.toBeInTheDocument();
});

test("once the Reel is ready Show in folder asks the server to open it", () => {
  const onShow = vi.fn();
  const { rerender } = render(view(reel({ state: "rendering", progress: 0.9 }), { onShow }));
  rerender(view(reel({ state: "ready" }), { onShow }));
  fireEvent.click(screen.getByRole("button", { name: /Show in folder/ }));
  expect(onShow).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("90%")).not.toBeInTheDocument();
});

test("a failed Reel shows the reason", () => {
  render(view(reel({ state: "failed", error: "ffmpeg failed" })));
  expect(screen.getByRole("alert")).toHaveTextContent("ffmpeg failed");
});

test("a server error from Show in folder is shown", () => {
  render(view(reel({ state: "ready" }), { showError: "Beat b1 has no Reel on disk yet." }));
  expect(screen.getByText("Beat b1 has no Reel on disk yet.")).toBeInTheDocument();
});

test("a beat with nothing to make a Reel from says so", () => {
  render(view(reel({ state: "unavailable" })));
  expect(screen.getByText(/no audio and cover/)).toBeInTheDocument();
});
