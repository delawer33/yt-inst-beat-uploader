import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatViews } from "@/lib/format";
import { DEFAULT_DAYS, useCollectStats, useOverview } from "./queries";
import { ViewsChart } from "./ViewsChart";

/** Channel totals for the last `days` days plus the per-day chart, and a manual collect. */
export function OverviewCard({ days = DEFAULT_DAYS }: { days?: number }) {
  const overview = useOverview(days);
  const collect = useCollectStats();
  const hasData = overview.data?.per_day.some((p) => p.views > 0) ?? false;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Last {days} days</CardTitle>
          <CardDescription>Views and watch time across the channel, per day.</CardDescription>
        </div>
        <div className="flex items-center gap-3">
          {collect.error && (
            <span role="alert" className="text-sm text-destructive">
              {collect.error.message}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => collect.mutate()}
            disabled={collect.isPending}
          >
            {collect.isPending ? "Queuing…" : "Collect stats now"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {overview.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {overview.error && (
          <p role="alert" className="text-sm text-destructive">
            {overview.error.message}
          </p>
        )}
        {overview.data && (
          <>
            <dl className="flex gap-8">
              <Stat label="views" value={formatViews(overview.data.views)} />
              <Stat label="minutes watched" value={formatViews(overview.data.watch_minutes)} />
            </dl>
            <ViewsChart
              points={hasData ? overview.data.per_day : []}
              label="Channel views per day"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground capitalize">{label}</dt>
      <dd className="text-2xl font-semibold" aria-label={label}>
        {value}
      </dd>
    </div>
  );
}
