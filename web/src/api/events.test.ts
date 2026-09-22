import { QueryClient } from "@tanstack/react-query";
import { applyJobEvent, jobKey, jobsKey, upsertJob, type Job } from "./events";

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
  ...over,
});

test("upsertJob replaces by id and prepends unseen jobs", () => {
  const list = [job({ id: "j1" }), job({ id: "j2" })];
  expect(upsertJob(list, job({ id: "j2", status: "done" })).map((j) => j.status)).toEqual([
    "queued",
    "done",
  ]);
  expect(upsertJob(list, job({ id: "j3" })).map((j) => j.id)).toEqual(["j3", "j1", "j2"]);
  expect(upsertJob(undefined, job())).toHaveLength(1);
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
  client.setQueryData<Job[]>([...jobsKey, { beatId: "b1" }], [job({ id: "j1", beat_id: "b1" })]);

  applyJobEvent(client, job({ id: "j1", beat_id: "b1", status: "running", progress: 0.4 }));

  expect(client.getQueryData<Job[]>(jobsKey)?.[0]).toMatchObject({ status: "running" });
  expect(client.getQueryData<Job[]>([...jobsKey, { beatId: "b1" }])?.[0]).toMatchObject({
    progress: 0.4,
  });
  expect(client.getQueryData<Job>(jobKey("j1"))).toMatchObject({ status: "running" });
  expect(fetches.count).toBe(0);
});
