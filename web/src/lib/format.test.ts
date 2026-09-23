import { formatDateTime, formatViews, serverDate, toDateTimeLocal } from "./format";

test("formatViews", () => {
  expect(formatViews(0)).toBe("0");
  expect(formatViews(999)).toBe("999");
  expect(formatViews(1000)).toBe("1K");
  expect(formatViews(1234)).toBe("1.2K");
  expect(formatViews(1_500_000)).toBe("1.5M");
});

test("serverDate reads naive timestamps as UTC and keeps explicit offsets", () => {
  expect(serverDate("2026-09-01T12:30:00").toISOString()).toBe("2026-09-01T12:30:00.000Z");
  expect(serverDate("2026-09-01T12:30:00Z").toISOString()).toBe("2026-09-01T12:30:00.000Z");
  expect(serverDate("2026-09-01T12:30:00+02:00").toISOString()).toBe("2026-09-01T10:30:00.000Z");
});

test("formatDateTime shows the local date and time", () => {
  const local = new Date(2026, 8, 24, 18, 5);
  const text = formatDateTime(local.toISOString().replace(/\.\d{3}Z$/, ""));
  expect(text).toMatch(/2026/);
  expect(text).toMatch(/18:05|6:05/);
  expect(formatDateTime(null)).toBe("");
  expect(formatDateTime("garbage")).toBe("");
});

test("toDateTimeLocal pads to the datetime-local format", () => {
  expect(toDateTimeLocal(new Date(2026, 0, 5, 7, 3))).toBe("2026-01-05T07:03");
});
