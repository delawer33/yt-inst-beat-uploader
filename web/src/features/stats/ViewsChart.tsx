import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatViews } from "@/lib/format";
import type { DayPoint } from "./queries";

const EMPTY_TEXT = "No daily stats yet. They are collected every night.";

/** ISO day -> "3 Sep" (the axis and the tooltip). */
function shortDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

type TooltipPayload = { payload?: DayPoint }[];

function DayTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">{shortDay(point.day)}</p>
      <p className="text-muted-foreground">
        {formatViews(point.views)} views · {formatViews(point.watch_minutes)} min watched
      </p>
      {point.views > 0 && (
        <p className="text-muted-foreground">
          avg {point.avg_view_seconds}s ({point.avg_view_percent}%)
        </p>
      )}
    </div>
  );
}

/**
 * Views per day as a single-series area chart. `points` is already continuous (the server
 * fills missing days with zeros), so the x-axis is just the day list.
 */
export function ViewsChart({ points, label = "Views per day" }: { points: DayPoint[]; label?: string }) {
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">{EMPTY_TEXT}</p>;
  }
  return (
    <div role="img" aria-label={label} className="h-44 w-full text-xs text-muted-foreground">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 176 }}>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="day"
            tickFormatter={shortDay}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            stroke="var(--color-muted-foreground)"
          />
          <YAxis
            allowDecimals={false}
            tickFormatter={formatViews}
            tickLine={false}
            axisLine={false}
            width={36}
            stroke="var(--color-muted-foreground)"
          />
          <Tooltip content={<DayTooltip />} cursor={{ stroke: "var(--color-muted-foreground)" }} />
          <Area
            type="monotone"
            dataKey="views"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            fill="var(--color-chart-2)"
            fillOpacity={0.15}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--color-background)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
