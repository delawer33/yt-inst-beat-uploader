import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSaveSettings, useSettings } from "./queries";

/** The hour (local time, 0–23) at which the nightly stats job runs. */
export function ScheduleForm() {
  const settings = useSettings();
  const save = useSaveSettings();
  const [hour, setHour] = useState("");
  const stored = settings.data?.stats_hour;

  useEffect(() => {
    if (stored !== undefined) setHour(String(stored));
  }, [stored]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate({ stats_hour: Number(hour) });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statistics</CardTitle>
        <CardDescription>
          Daily views and watch time are collected once a night from YouTube Analytics. Pick the
          hour (local time); a run missed while the computer was asleep happens on the next start.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>Hour (0–23)</span>
            <Input
              name="stats_hour"
              type="number"
              min={0}
              max={23}
              step={1}
              value={hour}
              onChange={(e) => setHour(e.target.value)}
              className="w-24"
              required
              disabled={settings.isPending}
            />
          </label>
          <Button type="submit" disabled={save.isPending || settings.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          {save.isError && <span className="text-sm text-destructive">{save.error.message}</span>}
          {save.isSuccess && !save.isPending && (
            <span className="text-sm text-muted-foreground">Saved.</span>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
