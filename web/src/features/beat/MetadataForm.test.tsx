import { fireEvent, render, screen } from "@testing-library/react";
import type { Beat } from "@/features/library/queries";
import { MetadataForm, parseTags, tagsLength } from "./MetadataForm";

const beat: Beat = {
  id: "b1",
  status: "draft",
  title: "Dark Night",
  description: "prod. me",
  tags: ["trap", "free"],
  category_id: 10,
  privacy: "private",
  youtube_id: null,
  youtube_url: null,
  published_at: null,
  views: 0,
  likes: 0,
  comments: 0,
  has_files: true,
  cover_url: "/api/beats/b1/cover",
  synced_at: null,
  created_at: "2026-09-22T10:00:00",
  updated_at: "2026-09-22T10:00:00",
};

test("parseTags splits on commas and drops blanks", () => {
  expect(parseTags(" trap, free , ,type beat")).toEqual(["trap", "free", "type beat"]);
  expect(tagsLength(["ab", "cde"])).toBe(5);
});

test("shows counters and calls onSave with only the changed fields", () => {
  const onSave = vi.fn();
  render(<MetadataForm beat={beat} onSave={onSave} />);

  expect(screen.getByLabelText("Title length")).toHaveTextContent("10/100");
  expect(screen.getByLabelText("Description length")).toHaveTextContent("8/5000");
  expect(screen.getByLabelText("Tags (comma separated) length")).toHaveTextContent("8/500");

  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New Title" } });
  fireEvent.change(screen.getByLabelText("Tags (comma separated)"), {
    target: { value: "trap, hard" },
  });
  fireEvent.change(screen.getByLabelText("Privacy"), { target: { value: "public" } });
  expect(screen.getByLabelText("Title length")).toHaveTextContent("9/100");

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith({ title: "New Title", tags: ["trap", "hard"], privacy: "public" });
});

test("a title over 100 characters disables Save and marks the counter", () => {
  render(<MetadataForm beat={beat} onSave={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "x".repeat(101) } });
  expect(screen.getByLabelText("Title length")).toHaveTextContent("101/100");
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("shows the server error next to Save", () => {
  render(<MetadataForm beat={beat} onSave={vi.fn()} error="youtube.title cannot be empty" />);
  expect(screen.getByRole("alert")).toHaveTextContent("youtube.title cannot be empty");
});
