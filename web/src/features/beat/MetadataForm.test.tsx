import { fireEvent, render, screen } from "@testing-library/react";
import type { Beat } from "@/features/library/queries";
import { defaultPublishAt, MetadataForm, parseTags, tagsLength } from "./MetadataForm";

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
  publish_at: null,
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

test("defaultPublishAt is tomorrow at the current hour", () => {
  expect(defaultPublishAt(new Date(2026, 8, 23, 14, 37, 9))).toEqual(new Date(2026, 8, 24, 14, 0, 0));
  expect(defaultPublishAt(new Date(2026, 11, 31, 23, 1))).toEqual(new Date(2027, 0, 1, 23, 0));
});

test("Scheduled reveals a prefilled local date-time input and saves private + publish_at", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 23, 14, 37));
  try {
    const onSave = vi.fn();
    render(<MetadataForm beat={beat} onSave={onSave} />);
    expect(screen.queryByLabelText("Publish at")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Privacy"), { target: { value: "scheduled" } });
    const input = screen.getByLabelText("Publish at") as HTMLInputElement;
    expect(input.type).toBe("datetime-local");
    expect(input.value).toBe("2026-09-24T14:00");

    fireEvent.change(input, { target: { value: "2026-09-25T18:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      privacy: "private",
      publish_at: new Date(2026, 8, 25, 18, 30).toISOString(),
    });
  } finally {
    vi.useRealTimers();
  }
});

test("a scheduled beat opens as Scheduled; another choice clears publish_at", () => {
  const onSave = vi.fn();
  const scheduled: Beat = { ...beat, privacy: "private", publish_at: "2026-09-25T15:30:00" };
  render(<MetadataForm beat={scheduled} onSave={onSave} />);
  expect(screen.getByLabelText("Privacy")).toHaveValue("scheduled");
  expect(screen.getByLabelText("Publish at")).toHaveValue(
    "2026-09-25T" +
      String(new Date("2026-09-25T15:30:00Z").getHours()).padStart(2, "0") +
      ":" +
      String(new Date("2026-09-25T15:30:00Z").getMinutes()).padStart(2, "0"),
  );

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith({}); // nothing changed

  fireEvent.change(screen.getByLabelText("Privacy"), { target: { value: "public" } });
  expect(screen.queryByLabelText("Publish at")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenLastCalledWith({ privacy: "public", publish_at: null });
});
