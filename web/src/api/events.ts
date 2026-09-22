import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { components } from "./schema";

export type Job = components["schemas"]["JobOut"];
export type BeatEvent = { id: string; status: string };

export const jobsKey = ["jobs"] as const;
export const jobKey = (id: string) => ["jobs", id] as const;

/** Upsert `job` into a list: replace by id, or prepend when unseen (lists are newest first). */
export function upsertJob(jobs: Job[] | undefined, job: Job): Job[] {
  if (!jobs) return [job];
  const index = jobs.findIndex((j) => j.id === job.id);
  if (index === -1) return [job, ...jobs];
  const next = jobs.slice();
  next[index] = job;
  return next;
}

/** A "job" SSE event patches every jobs cache in place; no refetch. */
export function applyJobEvent(queryClient: QueryClient, job: Job): void {
  queryClient.setQueriesData<Job[]>({ queryKey: jobsKey, exact: false, type: "all" }, (old) => {
    if (old === undefined || !Array.isArray(old)) return old;
    return upsertJob(old, job);
  });
  queryClient.setQueryData<Job>(jobKey(job.id), job);
}

/** A "beat" SSE event: beats are owned by another query family, so just refetch them. */
export function applyBeatEvent(queryClient: QueryClient, _event: BeatEvent): void {
  void queryClient.invalidateQueries({ queryKey: ["beats"] });
}

export const EVENTS_URL = "/api/events";

/** Subscribe to `/api/events` for the lifetime of the app shell. Call once. */
export function useEvents(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(EVENTS_URL);
    const onJob = (e: MessageEvent<string>) => applyJobEvent(queryClient, JSON.parse(e.data));
    const onBeat = (e: MessageEvent<string>) => applyBeatEvent(queryClient, JSON.parse(e.data));
    source.addEventListener("job", onJob);
    source.addEventListener("beat", onBeat);
    return () => source.close();
  }, [queryClient]);
}
