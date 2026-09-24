import type { Job } from "@/api/events";
import {
  countBeats,
  failedBeats,
  filterBeats,
  jobState,
  sortBeats,
  totalViews,
} from "./filters";
import { DEFAULT_PREFS, parsePrefs } from "./prefs";
import type { Beat } from "./queries";

const job = (over: Partial<Job> = {}): Job => ({
  id: "j1",
  beat_id: "b1",
  kind: "render",
  status: "running",
  progress: 0.62,
  message: "",
  error: null,
  created_at: "2026-09-20T10:00:00",
  started_at: null,
  finished_at: null,
  attempts: 0,
  not_before: null,
  ...over,
});

const beat = (over: Partial<Beat> & { id: string }): Beat => ({
  status: "published",
  title: "A beat",
  description: "",
  tags: [],
  category_id: 10,
  privacy: "public",
  youtube_id: null,
  youtube_url: null,
  published_at: null,
  publish_at: null,
  views: 0,
  likes: 0,
  comments: 0,
  has_files: false,
  rendered: false,
  active_job: null,
  cover_url: null,
  synced_at: null,
  created_at: "2026-09-01T10:00:00",
  updated_at: "2026-09-01T10:00:00",
  ...over,
});

const beats: Beat[] = [
  beat({ id: "d1", status: "draft", created_at: "2026-09-03T10:00:00", views: 0 }),
  beat({
    id: "d2",
    status: "draft",
    created_at: "2026-09-04T10:00:00",
    active_job: job({ id: "j-render", beat_id: "d2" }),
  }),
  beat({ id: "q1", status: "queued", created_at: "2026-09-02T10:00:00" }),
  beat({ id: "p1", status: "published", created_at: "2026-09-01T10:00:00", views: 4200 }),
  beat({ id: "p2", status: "published", created_at: "2026-09-05T10:00:00", views: 90 }),
];

test("the counts cover every filter; a working Draft counts under both Draft and Working", () => {
  expect(countBeats(beats)).toEqual({ all: 5, draft: 2, queued: 1, working: 1, published: 2 });
  expect(filterBeats(beats, "working").map((b) => b.id)).toEqual(["d2"]);
  expect(filterBeats(beats, "draft").map((b) => b.id)).toEqual(["d1", "d2"]);
  expect(filterBeats(beats, "all")).toHaveLength(5);
});

test("total views is the sum over the list", () => {
  expect(totalViews(beats)).toBe(4290);
});

test("sorting is pure and orders by newest, views or status", () => {
  const order = (sort: "newest" | "views" | "status") => sortBeats(beats, sort).map((b) => b.id);
  expect(order("newest")).toEqual(["p2", "d2", "d1", "q1", "p1"]);
  expect(order("views")).toEqual(["p1", "p2", "d2", "d1", "q1"]);
  expect(order("status")).toEqual(["d2", "d1", "q1", "p2", "p1"]);
  expect(beats.map((b) => b.id)).toEqual(["d1", "d2", "q1", "p1", "p2"]);
});

test("a beat is failed when its most recent job failed, not an older one", () => {
  const jobs = [
    job({ id: "old", beat_id: "b1", status: "failed", created_at: "2026-09-01T10:00:00" }),
    job({ id: "new", beat_id: "b1", status: "done", created_at: "2026-09-02T10:00:00" }),
    job({ id: "bad", beat_id: "b2", status: "failed", created_at: "2026-09-02T10:00:00" }),
    job({ id: "sync", beat_id: null, status: "failed" }),
  ];
  expect([...failedBeats(jobs)]).toEqual(["b2"]);
  expect(failedBeats(undefined).size).toBe(0);
});

test("the job state reads as what is happening now", () => {
  expect(jobState(job())).toBe("Rendering 62%");
  expect(jobState(job({ kind: "upload", status: "queued" }))).toBe("Uploading queued");
  expect(jobState(job({ status: "paused" }))).toBe("Rendering paused");
});

test("stored toolbar preferences are read back, and anything unknown falls back", () => {
  expect(parsePrefs('{"filter":"working","sort":"views","view":"list"}')).toEqual({
    filter: "working",
    sort: "views",
    view: "list",
  });
  expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
  expect(parsePrefs("not json")).toEqual(DEFAULT_PREFS);
  expect(parsePrefs('{"filter":"nonsense"}')).toEqual(DEFAULT_PREFS);
});
