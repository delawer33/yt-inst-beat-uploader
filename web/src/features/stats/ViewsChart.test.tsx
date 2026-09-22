import { render, screen } from "@testing-library/react";
import type { DayPoint } from "./queries";
import { ViewsChart } from "./ViewsChart";

const point = (day: string, views: number): DayPoint => ({
  day,
  views,
  watch_minutes: views * 2,
  avg_view_seconds: 60,
  avg_view_percent: 40.0,
});

test("renders a chart for three points", () => {
  render(<ViewsChart points={[point("2026-09-19", 3), point("2026-09-20", 0), point("2026-09-21", 7)]} />);

  expect(screen.getByRole("img", { name: "Views per day" })).toBeInTheDocument();
  expect(screen.queryByText(/No daily stats yet/)).not.toBeInTheDocument();
});

test("shows an empty state without points", () => {
  render(<ViewsChart points={[]} />);

  expect(screen.getByText(/No daily stats yet/)).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
