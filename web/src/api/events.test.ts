import { QueryClient } from "@tanstack/react-query";
import {
  applyJobEvent,
  applyOpen,
  beatJobsKey,
  jobKey,
  jobsKey,
  listAccepts,
  upsertJob,
  type Job,
} from "./events";

const job = (over: Partial<Job> = {}): Job => ({
  id: "j1",
  beat_id: null,
  kind: "sync",
  status: "queued",
  progress: 0,
  message: "",
  error: null,
  created_at: "2026-09-22T10:00:00",
  started_at: null,
  finished_at: null,
  attempts: 0,
  not_before: null,
  ...over,
});

test("upsertJob replaces by id and prepends unseen jobs", () => {
  const list = [job({ id: "j1" }), job({ id: "j2" })];
  expect(
    upsertJob(list, job({ id: "j2", status: "done" })).map((j) => j.status),
  ).toEqual(["queued", "done"]);
  expect(upsertJob(list, job({ id: "j3" })).map((j) => j.id)).toEqual([
    "j3",
    "j1",
    "j2",
  ]);
  expect(upsertJob(undefined, job())).toHaveLength(1);
  expect(upsertJob(list, job({ id: "j3" }), false).map((j) => j.id)).toEqual([
    "j1",
    "j2",
  ]);
  expect(upsertJob(undefined, job(), false)).toEqual([]);
});

test("listAccepts matches the global list and the job's own beat only", () => {
  const j = job({ beat_id: "b1" });
  expect(listAccepts(jobsKey, j)).toBe(true);
  expect(listAccepts(beatJobsKey("b1"), j)).toBe(true);
  expect(listAccepts(beatJobsKey("b2"), j)).toBe(false);
  expect(listAccepts(jobKey("j1"), j)).toBe(false);
  expect(listAccepts(beatJobsKey("b1"), job({ beat_id: null }))).toBe(false);
});

test("an unseen job is prepended only to lists that would contain it", () => {
  const client = new QueryClient();
  client.setQueryData<Job[]>(jobsKey, [job({ id: "j1" })]);
  client.setQueryData<Job[]>(beatJobsKey("b1"), [
    job({ id: "j1", beat_id: "b1" }),
  ]);
  client.setQueryData<Job[]>(beatJobsKey("b2"), [
    job({ id: "j2", beat_id: "b2" }),
  ]);

  applyJobEvent(client, job({ id: "j9", beat_id: "b1" }));

  expect(client.getQueryData<Job[]>(jobsKey)?.map((j) => j.id)).toEqual([
    "j9",
    "j1",
  ]);
  expect(
    client.getQueryData<Job[]>(beatJobsKey("b1"))?.map((j) => j.id),
  ).toEqual(["j9", "j1"]);
  expect(
    client.getQueryData<Job[]>(beatJobsKey("b2"))?.map((j) => j.id),
  ).toEqual(["j2"]);
  expect(client.getQueryData<Job>(jobKey("j9"))).toMatchObject({
    beat_id: "b1",
  });
});

test("a known job is replaced in place even in a mismatching list", () => {
  const client = new QueryClient();
  client.setQueryData<Job[]>(beatJobsKey("b2"), [
    job({ id: "j1", beat_id: "b2" }),
  ]);
  applyJobEvent(client, job({ id: "j1", beat_id: "b1", status: "done" }));
  expect(client.getQueryData<Job[]>(beatJobsKey("b2"))).toMatchObject([
    { id: "j1", status: "done" },
  ]);
});

test("a reconnect invalidates jobs and beats; the first open does not", () => {
  const client = new QueryClient();
  client.setQueryData<Job[]>(jobsKey, []);
  client.setQueryData(["beats"], []);
  const isStale = (key: readonly unknown[]) =>
    client.getQueryState(key)?.isInvalidated;

  applyOpen(client, false);
  expect(isStale(jobsKey)).toBe(false);
  applyOpen(client, true);
  expect(isStale(jobsKey)).toBe(true);
  expect(isStale(["beats"])).toBe(true);
});

test("a job event patches the jobs cache without a refetch", () => {
  const client = new QueryClient();
  const fetches = { count: 0 };
  client.setQueryDefaults(jobsKey, {
    queryFn: () => {
      fetches.count += 1;
      return [] as Job[];
    },
  });
  client.setQueryData<Job[]>(jobsKey, [job({ id: "j1" })]);
  client.setQueryData<Job[]>(beatJobsKey("b1"), [
    job({ id: "j1", beat_id: "b1" }),
  ]);

  applyJobEvent(
    client,
    job({ id: "j1", beat_id: "b1", status: "running", progress: 0.4 }),
  );

  expect(client.getQueryData<Job[]>(jobsKey)?.[0]).toMatchObject({
    status: "running",
  });
  expect(client.getQueryData<Job[]>(beatJobsKey("b1"))?.[0]).toMatchObject({
    progress: 0.4,
  });
  expect(client.getQueryData<Job>(jobKey("j1"))).toMatchObject({
    status: "running",
  });
  expect(fetches.count).toBe(0);
});
