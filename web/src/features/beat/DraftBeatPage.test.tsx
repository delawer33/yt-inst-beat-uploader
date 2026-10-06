import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Beat } from "@/features/library/queries";
import { AUTOSAVE_MS, DraftBeatView, formOf, patchOf, rebase } from "./DraftBeatPage";

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
  source_name: "Dmin110.mp3",
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
  const onFill = vi.fn();
  const view = (b: Beat) => (
    <MemoryRouter>
      <DraftBeatView
        beat={b}
        channel="NOVA Beats"
        library={library}
        failedRender={null}
        onSave={onSave}
        onSend={onSend}
        onDelete={onDelete}
        onRetry={vi.fn()}
        onFill={onFill}
        {...props}
      />
    </MemoryRouter>
  );
  const { rerender } = render(view(beat));
  /** The live Beat changed on the server (a refetch, the answer to a save). */
  const refetch = (next: Beat) => rerender(view(next));
  return { onSave, onSend, onDelete, onFill, refetch };
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

const description = () => screen.getByLabelText(/^Description/);

/**
 * The overwrite: the form used to diff itself against the live Beat, so a change that came
 * from the server after the page opened read as the owner's edit and was saved back as the
 * old text.
 */
test("a server-side change to an untouched field shows up and is not saved back", () => {
  vi.useFakeTimers();
  const { onSave, refetch } = renderView();

  refetch({ ...draft, description: "Written elsewhere.", tags: ["drill"] });

  expect(description()).toHaveValue("Written elsewhere.");
  expect(screen.getByRole("button", { name: "Remove tag drill" })).toBeInTheDocument();
  vi.advanceTimersByTime(AUTOSAVE_MS * 3);
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  vi.useRealTimers();
});

test("a field under edit keeps the owner's text when the Beat is refetched", () => {
  vi.useFakeTimers();
  const { onSave, refetch } = renderView();

  fireEvent.change(title(), { target: { value: "Static" } });
  refetch({ ...draft, title: "Server title", description: "Written elsewhere." });

  expect(title()).toHaveValue("Static");
  expect(description()).toHaveValue("Written elsewhere.");
  vi.advanceTimersByTime(AUTOSAVE_MS);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith({ title: "Static" });
  vi.useRealTimers();
});

test("rebase adopts the server's value only where the form still holds the old one", () => {
  const form = { ...formOf(draft), title: "Mine" };
  const next: Beat = { ...draft, title: "Theirs", description: "New", privacy: "private" };
  expect(rebase(form, draft, next)).toEqual({
    ...formOf(next),
    title: "Mine",
  });
});

// --- Fill from title ------------------------------------------------------------------------

const fillButton = () => screen.getByRole("button", { name: /Fill from title/ });

test("the file facts show the audio file name as it was dropped", () => {
  renderView();
  expect(screen.getByText("Dmin110.mp3")).toBeInTheDocument();
});

test("Fill from title sends the form as it is and puts the answer into it", () => {
  vi.useFakeTimers();
  const { onFill, onSave } = renderView();
  fireEvent.change(description(), { target: { value: "BPM: [[140]] mine" } });

  fireEvent.click(fillButton());
  expect(onFill).toHaveBeenCalledWith(
    { title: "Ninety", description: "BPM: [[140]] mine", tags: ["uk drill"] },
    expect.any(Function),
  );
  // The armed autosave still runs: a fill that fails must not cost the owner's edit.
  vi.advanceTimersByTime(AUTOSAVE_MS);
  expect(onSave).toHaveBeenCalledWith({ description: "BPM: [[140]] mine" });
  onSave.mockClear();

  const apply = onFill.mock.calls[0][1];
  act(() => apply({ description: "BPM: 140 mine", tags: ["uk drill", "drill type beat"] }));
  expect(description()).toHaveValue("BPM: 140 mine");
  expect(screen.getByRole("button", { name: "Remove tag drill type beat" })).toBeInTheDocument();

  vi.advanceTimersByTime(AUTOSAVE_MS);
  expect(onSave).toHaveBeenCalledWith({
    description: "BPM: 140 mine",
    tags: ["uk drill", "drill type beat"],
  });
  vi.useRealTimers();
});

test("Fill from title is dead while the title holds a Placeholder, and names it", () => {
  renderView({ ...draft, title: "Travis Scott Type Beat x [[Artist2]] | [[Hard Trap]]" });
  expect(fillButton()).toBeDisabled();
  expect(screen.getByText("Title still has [[Artist2]]")).toBeInTheDocument();

  fireEvent.change(title(), { target: { value: "Travis Scott Type Beat | Hard Trap" } });
  expect(fillButton()).toBeEnabled();
  expect(screen.queryByText(/Title still has/)).not.toBeInTheDocument();
});

test("Fill from title is dead on a Queued beat", () => {
  renderView({ ...draft, status: "queued" });
  expect(fillButton()).toBeDisabled();
});

test("a running fill says so, cannot be pressed twice, and holds the fields it will write", () => {
  renderView({ ...draft, rendered: true }, { filling: true });
  expect(screen.getByRole("button", { name: "Filling…" })).toBeDisabled();
  expect(description()).toHaveAttribute("readonly");
  expect(screen.getByLabelText("Add a tag")).toBeDisabled();
  expect(screen.getByRole("button", { name: /Save & upload when rendered/ })).toBeDisabled();
});

test("a failed fill shows its note and leaves the form as it was", () => {
  renderView(draft, { fillError: "`claude` is not logged in for this user." });
  expect(screen.getByRole("alert")).toHaveTextContent("not logged in");
  expect(description()).toHaveValue("Free for non-profit.");
});

test("the send button is dead while a Placeholder is left, and says where", () => {
  renderView({ ...draft, description: "BPM: [[140]]" });
  expect(screen.getByRole("button", { name: /Save & upload when rendered/ })).toBeDisabled();
  expect(screen.getByText("Fill the placeholders in the description")).toBeInTheDocument();

  fireEvent.change(description(), { target: { value: "BPM: 140" } });
  expect(screen.getByRole("button", { name: /Save & upload when rendered/ })).toBeEnabled();
});

test("an edit undone while its save is in flight is not brought back by the answer", () => {
  vi.useFakeTimers();
  const { onSave, refetch } = renderView();

  fireEvent.change(description(), { target: { value: "Free.x" } });
  vi.advanceTimersByTime(AUTOSAVE_MS);
  expect(onSave).toHaveBeenLastCalledWith({ description: "Free.x" });

  // Backspace before the PATCH comes back; then the answer to the save lands.
  fireEvent.change(description(), { target: { value: "Free for non-profit." } });
  refetch({ ...draft, description: "Free.x" });

  expect(description()).toHaveValue("Free for non-profit.");
  vi.advanceTimersByTime(AUTOSAVE_MS);
  expect(onSave).toHaveBeenLastCalledWith({ description: "Free for non-profit." });
  vi.useRealTimers();
});
