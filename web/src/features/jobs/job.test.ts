import type { Job } from "@/api/events";
import { serverDate } from "@/lib/format";
import { canRetry, isWaitingForRetry, jobDuration, jobLog, jobWhen } from "./job";

const done: Job = {
  id: "j1",
  beat_id: "b1",
  kind: "upload",
  status: "done",
  progress: 1,
  message: "uploaded",
  error: null,
  created_at: "2026-09-22T10:00:00",
  started_at: "2026-09-22T10:00:01",
  finished_at: "2026-09-22T10:00:05",
  attempts: 1,
  not_before: null,
};

test("a failed or paused job can be retried, a done or running one cannot", () => {
  expect(canRetry({ ...done, status: "failed" })).toBe(true);
  expect(canRetry({ ...done, status: "paused" })).toBe(true);
  expect(canRetry(done)).toBe(false);
  expect(canRetry({ ...done, status: "running" })).toBe(false);
});

test("queued with a not_before is a job waiting out a retry backoff", () => {
  const waiting: Job = { ...done, status: "queued", not_before: "2026-09-22T10:30:00" };

  expect(isWaitingForRetry(waiting)).toBe(true);
  expect(canRetry(waiting)).toBe(true);
  expect(isWaitingForRetry({ ...done, status: "queued" })).toBe(false);
});

test("the log is the message and the error together", () => {
  expect(jobLog(done)).toBe("uploaded");
  expect(jobLog({ ...done, error: "YouTube said no" })).toBe("uploaded\nYouTube said no");
  expect(jobLog({ ...done, message: "", error: null })).toBe("");
});

test("the duration reads in seconds, then in minutes", () => {
  expect(jobDuration(done)).toBe("4.0 s");
  expect(jobDuration({ ...done, finished_at: "2026-09-22T10:02:32" })).toBe("2 m 31 s");
  expect(jobDuration({ ...done, finished_at: null })).toBeNull();
});

test("a job that ran today says so, an older one carries its date", () => {
  // The same instant, read as "now": whatever the zone, that is today.
  const sameDay = serverDate(done.started_at as string);

  expect(jobWhen(done, sameDay)).toMatch(/^today \d\d:\d\d$/);

  const later = jobWhen(done, new Date(sameDay.getTime() + 3 * 24 * 3600 * 1000));
  expect(later).not.toMatch(/today/);
  expect(later).toMatch(/\d\d:\d\d$/);
});
