import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { applyJobEvent } from "@/api/events";
import type { components } from "@/api/schema";
import { unwrap } from "@/api/unwrap";

export type DayPoint = components["schemas"]["DayPoint"];
export type Overview = components["schemas"]["OverviewOut"];

export const DEFAULT_DAYS = 28;

/** Invalidated as a family when a STATS job finishes (see `useEvents`). */
export const statsKey = ["stats"] as const;
export const beatStatsKey = (id: string, days: number) => [...statsKey, "beat", id, days] as const;
export const overviewKey = (days: number) => [...statsKey, "overview", days] as const;

export function useBeatStats(id: string, days = DEFAULT_DAYS) {
  return useQuery({
    queryKey: beatStatsKey(id, days),
    queryFn: () =>
      unwrap(
        api.GET("/api/beats/{beat_id}/stats", {
          params: { path: { beat_id: id }, query: { days } },
        }),
      ),
  });
}

export function useOverview(days = DEFAULT_DAYS) {
  return useQuery({
    queryKey: overviewKey(days),
    queryFn: () => unwrap(api.GET("/api/stats/overview", { params: { query: { days } } })),
  });
}

/** `POST /api/stats/collect`: run the nightly STATS job now. */
export function useCollectStats() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/stats/collect")),
    onSuccess: (job) => applyJobEvent(queryClient, job),
  });
}
