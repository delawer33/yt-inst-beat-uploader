import { useEffect } from "react";
import {
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type { components } from "./schema";

export type Job = components["schemas"]["JobOut"];
export type BeatEvent = { id: string; status: string };

export const jobsKey = ["jobs"] as const;
export const jobKey = (id: string) => ["jobs", id] as const;
export const beatJobsKey = (beatId: string) =>
  [...jobsKey, { beatId }] as const;

/**
 * Upsert `job` into a list: replace by id, or (when `prepend`) add it at the front — lists
 * are newest first. With `prepend: false` an unseen job leaves the list untouched.
 */
export function upsertJob(
  jobs: Job[] | undefined,
  job: Job,
  prepend = true,
): Job[] {
  const index = jobs?.findIndex((j) => j.id === job.id) ?? -1;
  if (index === -1) return prepend ? [job, ...(jobs ?? [])] : (jobs ?? []);
  const next = jobs!.slice();
  next[index] = job;
  return next;
}

/** Does a jobs-list query key (`["jobs"]` or `["jobs", { beatId }]`) include `job`? */
export function listAccepts(queryKey: QueryKey, job: Job): boolean {
  const scope = queryKey[1];
  if (scope === undefined) return true;
  if (typeof scope === "object" && scope !== null && "beatId" in scope) {
    return (scope as { beatId: unknown }).beatId === job.beat_id;
  }
  return false;
}

/** A "job" SSE event patches every jobs cache in place; no refetch. */
export function applyJobEvent(queryClient: QueryClient, job: Job): void {
  const lists = queryClient
    .getQueryCache()
    .findAll({ queryKey: jobsKey, exact: false, type: "all" });
  for (const query of lists) {
    if (!Array.isArray(query.state.data)) continue;
    queryClient.setQueryData<Job[]>(query.queryKey, (old) =>
      upsertJob(old, job, listAccepts(query.queryKey, job)),
    );
  }
  queryClient.setQueryData<Job>(jobKey(job.id), job);
  if (job.kind === "stats" && job.status === "done") {
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  }
}

/** The stream (re)opened. After an outage, whatever we missed is refetched. */
export function applyOpen(queryClient: QueryClient, reconnect: boolean): void {
  if (!reconnect) return;
  void queryClient.invalidateQueries({ queryKey: jobsKey });
  void queryClient.invalidateQueries({ queryKey: ["beats"] });
}

/** A "beat" SSE event: beats are owned by another query family, so just refetch them. */
export function applyBeatEvent(
  queryClient: QueryClient,
  _event: BeatEvent,
): void {
  void queryClient.invalidateQueries({ queryKey: ["beats"] });
}

export const EVENTS_URL = "/api/events";

/** Subscribe to `/api/events` for the lifetime of the app shell. Call once. */
export function useEvents(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(EVENTS_URL);
    let opened = false;
    source.onopen = () => {
      applyOpen(queryClient, opened);
      opened = true;
    };
    const onJob = (e: MessageEvent<string>) =>
      applyJobEvent(queryClient, JSON.parse(e.data));
    const onBeat = (e: MessageEvent<string>) =>
      applyBeatEvent(queryClient, JSON.parse(e.data));
    source.addEventListener("job", onJob);
    source.addEventListener("beat", onBeat);
    return () => source.close();
  }, [queryClient]);
}
