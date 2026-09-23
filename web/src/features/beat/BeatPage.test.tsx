import { fireEvent, render, screen } from "@testing-library/react";
import type { Beat } from "@/features/library/queries";
import { serverDate, toDateTimeLocal } from "@/lib/format";
import { PrivacyControl } from "./BeatPage";
import { defaultPublishAt } from "./MetadataForm";

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
