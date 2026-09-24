import { formatViews } from "@/lib/format";
import type { DayPoint } from "./queries";

const EMPTY_TEXT = "No daily stats yet. They are collected every night.";

/** One bar of the chart: what the Design System's `.bars > i` needs. */
export type Bar = {
  day: string;
  views: number;
  /** Percent of the tallest day, 0 for a day with no views. */
  height: number;
  /** The tallest day; the only red bar in the chart. */
  peak: boolean;
  /** The last day of the window: the nightly pull may not have counted all of it. */
  partial: boolean;
};

/**
 * Days to bars. Pure. `points` is already continuous and ends yesterday (the server
 * zero-fills), so the bars are the day list in order and the last one is the partial day.
 */
export function toBars(points: DayPoint[]): Bar[] {
  const max = Math.max(0, ...points.map((p) => p.views));
  const peakIndex = max > 0 ? points.findIndex((p) => p.views === max) : -1;
  return points.map((point, i) => ({
    day: point.day,
    views: point.views,
    // A day with a single view still deserves a visible sliver.
    height: point.views === 0 ? 0 : Math.max(2, Math.round((point.views / max) * 100)),
    peak: i === peakIndex,
    partial: i === points.length - 1,
  }));
}

export type Totals = { views: number; watchMinutes: number };

/** What the window adds up to, for the head line. Pure. */
export function totals(points: DayPoint[]): Totals {
  return {
    views: points.reduce((n, p) => n + p.views, 0),
    watchMinutes: points.reduce((n, p) => n + p.watch_minutes, 0),
  };
}

/** ISO day -> "3 Sep". */
export function shortDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The three labels under the bars: the first day, the peak, and the partial last day. */
export function axisLabels(bars: Bar[]): string[] {
  if (bars.length === 0) return [];
  const last = bars.length - 1;
  const peak = bars.findIndex((b) => b.peak);
  const labels = [shortDay(bars[0].day)];
  if (peak > 0 && peak < last) labels.push(`${shortDay(bars[peak].day)} · ${formatViews(bars[peak].views)}`);
  if (last > 0) labels.push(`${shortDay(bars[last].day)} (partial)`);
  return labels;
}

/**
 * Views per day in the Design System's bar style: one neutral bar a day, the peak in red,
 * the last day hatched because the nightly pull may not have counted all of it.
 */
export function DailyBars({ points, label = "Views per day" }: { points: DayPoint[]; label?: string }) {
  if (points.length === 0) {
    return <p className="text-muted">{EMPTY_TEXT}</p>;
  }
  const bars = toBars(points);
  const sum = totals(points);
  return (
    <div className="stats">
      <div className="stats-head">
        <b>{label}</b>
        <span className="num text-muted">
          {points.length} days · {formatViews(sum.views)} views · {formatViews(sum.watchMinutes)} min watched
        </span>
      </div>
      <div
        className="bars"
        role="img"
        aria-label={`${label}, ${points.length} days, ${sum.views} views`}
      >
        {bars.map((bar) => (
          <i
            key={bar.day}
            className={[bar.peak && "peak", bar.partial && "partial"].filter(Boolean).join(" ")}
            style={{ height: `${bar.height}%` }}
            title={`${shortDay(bar.day)} · ${bar.views} views`}
            data-testid="bar"
          />
        ))}
      </div>
      <div className="bars-axis">
        {axisLabels(bars).map((text, i) => (
          <span key={i}>{text}</span>
        ))}
      </div>
    </div>
  );
}
