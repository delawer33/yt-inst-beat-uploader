import { render, screen } from "@testing-library/react";
import { axisLabels, DailyBars, toBars, totals } from "./DailyBars";
import type { DayPoint } from "./queries";

const point = (day: string, views: number): DayPoint => ({
  day,
  views,
  watch_minutes: views * 2,
  avg_view_seconds: 60,
  avg_view_percent: 40.0,
});

const week = [point("2026-09-19", 3), point("2026-09-20", 0), point("2026-09-21", 7)];

test("the tallest day is the peak and the last day is partial", () => {
  const bars = toBars(week);

  expect(bars.map((b) => b.peak)).toEqual([false, false, true]);
  expect(bars.map((b) => b.partial)).toEqual([false, false, true]);
  expect(bars.map((b) => b.height)).toEqual([43, 0, 100]);
});

test("a day with a single view still gets a visible sliver", () => {
  const bars = toBars([point("2026-09-19", 1), point("2026-09-20", 500)]);

  expect(bars[0].height).toBe(2);
});

test("with no views at all nothing is a peak and every bar is flat", () => {
  const bars = toBars([point("2026-09-19", 0), point("2026-09-20", 0)]);

  expect(bars.some((b) => b.peak)).toBe(false);
  expect(bars.map((b) => b.height)).toEqual([0, 0]);
});

test("the window totals add up", () => {
  expect(totals(week)).toEqual({ views: 10, watchMinutes: 20 });
});

test("the axis names the first day, the peak in between, and the partial last day", () => {
  const bars = toBars([point("2026-09-19", 3), point("2026-09-20", 9), point("2026-09-21", 7)]);

  const labels = axisLabels(bars);
  expect(labels).toHaveLength(3);
  expect(labels[1]).toMatch(/^(20 Sep|Sep 20) · 9$/);
  expect(labels[2]).toMatch(/\(partial\)$/);
});

test("the peak is left out of the axis when it is the last day", () => {
  expect(axisLabels(toBars(week))).toHaveLength(2);
});

test("renders one bar per day, the peak red and the last hatched", () => {
  render(<DailyBars points={week} />);

  const bars = screen.getAllByTestId("bar");
  expect(bars).toHaveLength(3);
  expect(bars[2].className).toBe("peak partial");
  expect(screen.getByRole("img", { name: /Views per day, 3 days, 10 views/ })).toBeInTheDocument();
});

test("shows an empty state without points", () => {
  render(<DailyBars points={[]} />);

  expect(screen.getByText(/No daily stats yet/)).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
