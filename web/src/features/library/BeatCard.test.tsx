import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
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
  views: 1234,
  likes: 12,
  comments: 3,
  has_files: false,
  cover_url: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
  synced_at: "2026-09-22T10:00:00",
  created_at: "2026-09-22T10:00:00",
  updated_at: "2026-09-22T10:00:00",
};

function renderCard(b: Beat) {
  const router = createMemoryRouter([{ path: "/", element: <BeatCard beat={b} /> }]);
  return render(<RouterProvider router={router} />);
}

test("renders title, formatted views and the status badge, linking to the beat", () => {
  renderCard(beat);
  expect(screen.getByRole("heading", { name: "Dark Trap Beat" })).toBeInTheDocument();
  expect(screen.getByLabelText("views")).toHaveTextContent("1.2K");
  expect(screen.getByLabelText("status")).toHaveTextContent("Published");
  expect(screen.getByRole("link")).toHaveAttribute("href", "/beats/b1");
  expect(screen.getByRole("img", { name: "Cover of Dark Trap Beat" })).toHaveAttribute(
    "src",
    beat.cover_url,
  );
});

test("a beat without a cover shows a placeholder instead of an image", () => {
  renderCard({ ...beat, cover_url: null, status: "draft", views: 0 });
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByLabelText("status")).toHaveTextContent("Draft");
  expect(screen.getByLabelText("views")).toHaveTextContent("0");
});
