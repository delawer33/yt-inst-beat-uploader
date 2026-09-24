import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Job } from "@/api/events";
import type { Beat } from "@/features/library/queries";
import type { DayPoint } from "@/features/stats/queries";
import { serverDate, toDateTimeLocal } from "@/lib/format";
import { PrivacyControl, PublishedBeatView } from "./PublishedBeatPage";
import { defaultPublishAt } from "./metadata";

const uploaded: Beat = {
  id: "b1",
  status: "uploaded",
  title: "Dark Night",
  description: "",
  tags: [],
  category_id: 10,
  privacy: "private",
  youtube_id: "yt1",
  youtube_url: "https://youtu.be/yt1",
  published_at: null,
  publish_at: null,
  views: 0,
  likes: 0,
  comments: 0,
  has_files: true,
  rendered: false,
  active_job: null,
  cover_url: null,
  synced_at: null,
  created_at: "2026-09-22T10:00:00",
  updated_at: "2026-09-22T10:00:00",
};

const scheduled: Beat = { ...uploaded, status: "scheduled", publish_at: "2026-10-01T18:00:00" };

const select = () => screen.getByLabelText("Privacy");
const pick = (value: string) => fireEvent.change(select(), { target: { value } });

afterEach(() => vi.restoreAllMocks());

test("Private, Unlisted and Public apply on selection and clear any schedule", () => {
  const onChange = vi.fn();
  render(<PrivacyControl beat={uploaded} onChange={onChange} />);
  expect(select()).toHaveValue("private");
  expect(screen.queryByRole("button", { name: "Schedule" })).not.toBeInTheDocument();

  pick("unlisted");
  expect(onChange).toHaveBeenCalledWith({ privacy: "unlisted", publish_at: null });
});

test("Scheduled shows the time field and sends only on the Schedule button", () => {
  const onChange = vi.fn();
  render(<PrivacyControl beat={uploaded} onChange={onChange} />);

  pick("scheduled");
  expect(onChange).not.toHaveBeenCalled();
  expect(select()).toHaveValue("scheduled");
  const input = screen.getByLabelText("Publish at");
  expect(input).toHaveValue(toDateTimeLocal(defaultPublishAt()));

  fireEvent.change(input, { target: { value: "2026-12-24T18:30" } });
  fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith({
    privacy: "private",
    publish_at: new Date("2026-12-24T18:30").toISOString(),
  });
});

test("picking Private again before Schedule just hides the field, no request", () => {
  const onChange = vi.fn();
  render(<PrivacyControl beat={uploaded} onChange={onChange} />);
  pick("scheduled");
  pick("private");
  expect(screen.queryByRole("button", { name: "Schedule" })).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

test("a Scheduled beat shows its time; a new time reschedules, the same time is disabled", () => {
  const onChange = vi.fn();
  render(<PrivacyControl beat={scheduled} onChange={onChange} />);
  expect(select()).toHaveValue("scheduled");
  const input = screen.getByLabelText("Publish at");
  expect(input).toHaveValue(toDateTimeLocal(serverDate("2026-10-01T18:00:00")));
  expect(screen.getByRole("button", { name: "Schedule" })).toBeDisabled();

  fireEvent.change(input, { target: { value: "2026-10-05T12:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
  expect(onChange).toHaveBeenCalledWith({
    privacy: "private",
    publish_at: new Date("2026-10-05T12:00").toISOString(),
  });
});

test("clearing the time field does not crash and disables Schedule", () => {
  const onChange = vi.fn();
  render(<PrivacyControl beat={scheduled} onChange={onChange} />);
  const input = screen.getByLabelText("Publish at");

  fireEvent.change(input, { target: { value: "" } });
  expect(input).toHaveValue("");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: "Schedule" })).toBeDisabled();
  expect(onChange).not.toHaveBeenCalled();

  fireEvent.change(input, { target: { value: "2026-10-05T12:00" } });
  expect(screen.getByRole("button", { name: "Schedule" })).toBeEnabled();
});

test("Private on a Scheduled beat cancels the schedule immediately", () => {
  const onChange = vi.fn();
  render(<PrivacyControl beat={scheduled} onChange={onChange} />);
  pick("private");
  expect(onChange).toHaveBeenCalledWith({ privacy: "private", publish_at: null });
});

test("Public on a Scheduled beat asks 'Publish now?' and only publishes on OK", () => {
  const onChange = vi.fn();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<PrivacyControl beat={scheduled} onChange={onChange} />);

  pick("public");
  expect(confirm).toHaveBeenCalledWith("Publish now?");
  expect(onChange).not.toHaveBeenCalled();
  expect(select()).toHaveValue("scheduled");

  confirm.mockReturnValue(true);
  pick("public");
  expect(onChange).toHaveBeenCalledWith({ privacy: "public", publish_at: null });
});

test("Public on a plain uploaded beat does not ask", () => {
  const onChange = vi.fn();
  const confirm = vi.spyOn(window, "confirm");
  render(<PrivacyControl beat={uploaded} onChange={onChange} />);
  pick("public");
  expect(confirm).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenCalledWith({ privacy: "public", publish_at: null });
});

test("shows the server error next to the selector", () => {
  render(<PrivacyControl beat={uploaded} onChange={vi.fn()} error="Not connected" />);
  expect(screen.getByRole("alert")).toHaveTextContent("Not connected");
});

// ── the page itself (Mockup 1f) ────────────────────────────────────────────

const published: Beat = {
  ...uploaded,
  status: "published",
  title: "Velvet",
  description: "Free for non-profit.",
  tags: ["melodic trap", "free type beat"],
  privacy: "public",
  published_at: "2026-09-09T14:12:00",
  views: 42118,
  likes: 980,
  comments: 41,
};

const renderJob: Job = {
  id: "j1",
  beat_id: "b1",
  kind: "render",
  status: "done",
  progress: 1,
  message: "frame= 7020 fps=241",
  error: null,
  created_at: "2026-09-09T14:08:00",
  started_at: "2026-09-09T14:08:00",
  finished_at: "2026-09-09T14:11:04",
  attempts: 1,
  not_before: null,
};

const failedStats: Job = {
  ...renderJob,
  id: "j2",
  kind: "stats",
  status: "failed",
  message: "",
  error: "YouTube 401 invalid_grant",
  finished_at: "2026-09-23T03:00:01",
};

const day = (d: string, views: number): DayPoint => ({
  day: d,
  views,
  watch_minutes: views,
  avg_view_seconds: 60,
  avg_view_percent: 40,
});

function renderPage(beat: Beat = published, props: Partial<Parameters<typeof PublishedBeatView>[0]> = {}) {
  const onRetry = vi.fn();
  const onPrivacy = vi.fn();
  render(
    <MemoryRouter>
      <PublishedBeatView
        beat={beat}
        jobs={[renderJob]}
        points={[day("2026-09-20", 3), day("2026-09-21", 9)]}
        onRetry={onRetry}
        onPrivacy={onPrivacy}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onRetry, onPrivacy };
}

test("the head carries the crumb, the status tag and the YouTube link", () => {
  renderPage();

  expect(screen.getByRole("link", { name: "← Library" })).toHaveAttribute("href", "/");
  expect(screen.getByText("Published")).toHaveAttribute("data-status", "published");
  const link = screen.getByRole("link", { name: /youtu\.be\/yt1/ });
  expect(link).toHaveAttribute("href", "https://youtu.be/yt1");
  expect(link).toHaveAttribute("target", "_blank");
});

test("the metadata is read-only: no title or description field, just the words and tags", () => {
  renderPage();

  expect(screen.getByRole("heading", { name: "Velvet" })).toBeInTheDocument();
  expect(screen.getByText("Free for non-profit.")).toBeInTheDocument();
  expect(screen.getByText("melodic trap")).toBeInTheDocument();
  expect(screen.queryByLabelText(/^Title/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/^Description/)).not.toBeInTheDocument();
});

test("the counters come from the beat", () => {
  renderPage();

  expect(screen.getByLabelText("Views")).toHaveTextContent("42.1K");
  expect(screen.getByLabelText("Likes")).toHaveTextContent("980");
});

test("a job's log opens inline in the history table and closes again", () => {
  renderPage();

  const toggle = screen.getByRole("button", { name: "Show log" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText(/frame= 7020/)).not.toBeInTheDocument();

  fireEvent.click(toggle);
  expect(screen.getByText(/frame= 7020/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Hide log" }));
  expect(screen.queryByText(/frame= 7020/)).not.toBeInTheDocument();
});

test("a failed job shows its log in a note with a retry", () => {
  const { onRetry } = renderPage(published, { jobs: [failedStats, renderJob] });

  const note = screen.getByRole("alert");
  expect(within(note).getByText(/invalid_grant/)).toBeInTheDocument();
  fireEvent.click(within(note).getByRole("button", { name: /Retry/ }));
  expect(onRetry).toHaveBeenCalledWith("j2");
});

test("the daily views are drawn as bars, the last one partial", () => {
  renderPage();

  const bars = screen.getAllByTestId("bar");
  expect(bars).toHaveLength(2);
  expect(bars[1].className).toContain("partial");
});

test("a scheduled beat keeps its schedule controls", () => {
  const { onPrivacy } = renderPage({ ...published, status: "scheduled", publish_at: "2026-10-01T18:00:00" });

  expect(screen.getByLabelText("Privacy")).toHaveValue("scheduled");
  expect(screen.getByLabelText("Publish at")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Publish at"), { target: { value: "2026-10-05T12:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Schedule" }));
  expect(onPrivacy).toHaveBeenCalledWith({
    privacy: "private",
    publish_at: new Date("2026-10-05T12:00").toISOString(),
  });
});

test("a beat that is not on YouTube yet cannot change its visibility", () => {
  renderPage({ ...published, status: "uploading", youtube_id: null, youtube_url: null });

  expect(screen.getByLabelText("Privacy")).toBeDisabled();
  expect(screen.getByText("Set on YouTube after upload.")).toBeInTheDocument();
  expect(screen.queryByTestId("bar")).not.toBeInTheDocument();
});
