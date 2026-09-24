import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Beat } from "@/features/library/queries";
import { AUTOSAVE_MS, DraftBeatView, formOf, patchOf } from "./DraftBeatPage";

const draft: Beat = {
  id: "b1",
  status: "draft",
  title: "Ninety",
  description: "Free for non-profit.",
  tags: ["uk drill"],
  category_id: 10,
  privacy: "public",
  youtube_id: null,
  youtube_url: null,
  published_at: null,
  publish_at: null,
  views: 0,
  likes: 0,
  comments: 0,
  has_files: true,
  rendered: false,
  active_job: null,
  cover_url: "/api/beats/b1/cover",
  synced_at: null,
  created_at: "2026-09-24T10:00:00",
  updated_at: "2026-09-24T10:00:00",
};

const library = [
  { id: "b1", title: "Ninety", tags: ["uk drill"] },
  { id: "b2", title: "Velvet", tags: ["uk drill", "free"] },
];

function renderView(beat: Beat = draft, props: Partial<Parameters<typeof DraftBeatView>[0]> = {}) {
  const onSave = vi.fn();
  const onSend = vi.fn();
  const onDelete = vi.fn();
  render(
    <MemoryRouter>
      <DraftBeatView
        beat={beat}
        channel="NOVA Beats"
        library={library}
        failedRender={null}
        onSave={onSave}
        onSend={onSend}
        onDelete={onDelete}
        onRetry={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onSave, onSend, onDelete };
}

const title = () => screen.getByLabelText(/^Title/);

test("typing saves once, after the debounce, with everything that changed", () => {
  vi.useFakeTimers();
  const { onSave } = renderView();

  for (const value of ["Ninet", "Nine", "Nin"]) {
    fireEvent.change(title(), { target: { value } });
    vi.advanceTimersByTime(200);
  }
  expect(onSave).not.toHaveBeenCalled();

  vi.advanceTimersByTime(AUTOSAVE_MS);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith({ title: "Nin" });

  vi.advanceTimersByTime(AUTOSAVE_MS * 5);
  expect(onSave).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

test("an unchanged form never saves", () => {
  vi.useFakeTimers();
  const { onSave } = renderView();
  vi.advanceTimersByTime(AUTOSAVE_MS * 3);
  expect(onSave).not.toHaveBeenCalled();
  vi.useRealTimers();
});

test("the head shows when the last save landed", () => {
  const at = new Date("2026-09-24T14:03:00");
  renderView(draft, { savedAt: at });
  expect(screen.getByRole("status")).toHaveTextContent(/^Draft saved \d\d:\d\d$/);
});

test("the preview checks the title length and counts the tags shared with another beat", () => {
  renderView();
  expect(screen.getByText("Tags shared with “Velvet”")).toBeInTheDocument();
  expect(screen.getByText("1 of 1")).toBeInTheDocument();

  fireEvent.change(title(), { target: { value: "x".repeat(71) } });
  expect(screen.getByText(/cut in search/)).toBeInTheDocument();
  expect(screen.getByText("71")).toBeInTheDocument();

  fireEvent.change(title(), { target: { value: "x".repeat(101) } });
  expect(screen.getByText(/too long/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Save & upload when rendered/ })).toBeDisabled();
});

test("the preview title follows the form and shows the channel", () => {
  renderView();
  fireEvent.change(title(), { target: { value: "Static" } });
  expect(screen.getByText("Static")).toBeInTheDocument();
  expect(screen.getByText("NOVA Beats")).toBeInTheDocument();
});

test("Save & upload when rendered sends the edits with the beat; Save draft only saves", () => {
  const { onSave, onSend } = renderView();
  fireEvent.change(title(), { target: { value: "Static" } });

  fireEvent.click(screen.getByRole("button", { name: /Save & upload when rendered/ }));
  expect(onSend).toHaveBeenCalledWith({ title: "Static" });
  expect(onSave).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(onSave).toHaveBeenCalledWith({ title: "Static" });
});

test("Save draft is dead while nothing has changed", () => {
  renderView();
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
});

test("a Rendered draft says the video is ready; a running Render shows its progress", () => {
  renderView({ ...draft, rendered: true });
  expect(screen.getByText("video ready")).toBeInTheDocument();
});

test("the Render job of the beat drives the progress bar and the log", () => {
  renderView({
    ...draft,
    active_job: {
      id: "j1",
      beat_id: "b1",
      kind: "render",
      status: "running",
      progress: 0.62,
      message: "frame 1200",
      error: null,
      created_at: "2026-09-24T10:00:00",
      started_at: "2026-09-24T10:00:01",
      finished_at: null,
      attempts: 0,
      not_before: null,
    },
  });
  expect(screen.getByText("Render 62%")).toBeInTheDocument();
  expect(screen.getByText("frame 1200")).toBeInTheDocument();
});

test("a Queued beat keeps the form but not the send button", () => {
  renderView({ ...draft, status: "queued" });
  expect(screen.queryByRole("button", { name: /Save & upload when rendered/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
  expect(title()).toBeInTheDocument();
});

test("sending drops the autosave that was already armed", () => {
  vi.useFakeTimers();
  const { onSave, onSend } = renderView();

  fireEvent.change(title(), { target: { value: "Static" } });
  vi.advanceTimersByTime(300);
  fireEvent.click(screen.getByRole("button", { name: /Save & upload when rendered/ }));
  expect(onSend).toHaveBeenCalledWith({ title: "Static" });

  vi.advanceTimersByTime(AUTOSAVE_MS * 3);
  expect(onSave).not.toHaveBeenCalled();
  vi.useRealTimers();
});

test("the two segment groups carry an accessible name", () => {
  renderView();
  expect(screen.getByRole("radiogroup", { name: "Privacy" })).toBeInTheDocument();
  expect(screen.getByRole("radiogroup", { name: "Publish" })).toBeInTheDocument();
});

test("Delete draft asks first, and only then removes the Draft", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { onDelete } = renderView();
  const button = screen.getByRole("button", { name: "Delete draft" });

  fireEvent.click(button);
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Ninety"));
  expect(onDelete).not.toHaveBeenCalled();

  confirm.mockReturnValue(true);
  fireEvent.click(button);
  expect(onDelete).toHaveBeenCalledTimes(1);
  confirm.mockRestore();
});

test("a Draft without its files explains itself instead of only greying the button out", () => {
  renderView({ ...draft, has_files: false });
  expect(screen.getByRole("button", { name: /Save & upload when rendered/ })).toBeDisabled();
  expect(screen.getByText(/Audio and cover are missing/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete draft" })).toBeEnabled();
});

test("a Queued beat offers no Delete: only a Draft is the owner's to throw away", () => {
  renderView({ ...draft, status: "queued" });
  expect(screen.queryByRole("button", { name: "Delete draft" })).not.toBeInTheDocument();
});

test("a publish_at carrying seconds is not an edit: the form opens clean", () => {
  vi.useFakeTimers();
  // 18:00:37.412 — a schedule the picker cannot express, so the round trip loses the seconds.
  const scheduled: Beat = {
    ...draft,
    privacy: "private",
    publish_at: "2026-10-01T15:00:37.412000",
  };
  const { onSave } = renderView(scheduled);

  expect(patchOf(formOf(scheduled), scheduled)).toEqual({});
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  vi.advanceTimersByTime(AUTOSAVE_MS * 3);
  expect(onSave).not.toHaveBeenCalled();
  vi.useRealTimers();
});
