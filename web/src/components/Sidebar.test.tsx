import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ReactNode } from "react";
import { SidebarView, pickRunning, JOBS_PAGE_LIMIT } from "./Sidebar";
import type { Job } from "@/api/events";

function renderInRouter(node: ReactNode, path = "/") {
  const router = createMemoryRouter([{ path: "*", element: node }], {
    initialEntries: [path],
  });
  return render(<RouterProvider router={router} />);
}

function job(over: Partial<Job>): Job {
  return {
    id: "j1",
    beat_id: null,
    kind: "render",
    status: "queued",
    progress: 0,
    message: "",
    error: null,
    created_at: "2026-09-24T10:00:00",
    started_at: null,
    finished_at: null,
    attempts: 0,
    not_before: null,
    ...over,
  } as Job;
}

test("the sidebar shows the Beat count and marks the current nav item", () => {
  renderInRouter(
    <SidebarView
      beatCount={64}
      running={null}
      queue={{ count: 0, partial: false }}
      status="connected"
    />,
  );

  const library = screen.getByRole("link", { name: /Library/ });
  expect(library).toHaveTextContent("64");
  expect(library).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
    "href",
    "/settings",
  );
  expect(screen.getByText("Connected")).toBeInTheDocument();
  expect(screen.queryByTestId("running-job")).not.toBeInTheDocument();
});

test("New beat is not a nav item", () => {
  renderInRouter(
    <SidebarView
      beatCount={0}
      running={null}
      queue={{ count: 0, partial: false }}
      status="connected"
    />,
  );
  expect(
    screen.queryByRole("link", { name: /New beat/ }),
  ).not.toBeInTheDocument();
});

test("the foot shows the running Job, its percent and what is queued behind it", () => {
  renderInRouter(
    <SidebarView
      beatCount={3}
      running={{ label: "Rendering", percent: 62, title: "Ninety" }}
      queue={{ count: 2, partial: false }}
      status="expired"
    />,
  );

  const foot = screen.getByTestId("running-job");
  expect(foot).toHaveTextContent("Rendering");
  expect(foot).toHaveTextContent("62%");
  expect(foot).toHaveTextContent("Ninety");
  expect(foot).toHaveTextContent("Then: 2 beats queued");
  expect(screen.getByText("Expired")).toBeInTheDocument();
});

test("pickRunning takes the running Job, its Beat title and the queued count", () => {
  const jobs = [
    job({
      id: "a",
      status: "running",
      progress: 0.615,
      kind: "upload",
      beat_id: "b1",
    }),
    job({ id: "b", beat_id: "b2" }),
    job({ id: "c", beat_id: "b3" }),
    job({ id: "d", status: "done" }),
  ];
  const { running, queue } = pickRunning(jobs, (id) =>
    id === "b1" ? "Ninety" : null,
  );

  expect(running).toEqual({ label: "Uploading", percent: 62, title: "Ninety" });
  expect(queue).toEqual({ count: 2, partial: false });
});

test("pickRunning reports nothing running when no Job is", () => {
  expect(pickRunning([job({ status: "done" })], () => null)).toEqual({
    running: null,
    queue: { count: 0, partial: false },
  });
  expect(pickRunning(undefined, () => null)).toEqual({
    running: null,
    queue: { count: 0, partial: false },
  });
});

test("the queue is still shown when nothing is running", () => {
  renderInRouter(
    <SidebarView
      beatCount={9}
      running={null}
      queue={{ count: 3, partial: false }}
      status="expired"
    />,
  );

  expect(screen.getByTestId("running-job")).toHaveTextContent(
    "Waiting: 3 beats queued",
  );
});

test("a queue longer than one page of Jobs is shown as a floor", () => {
  renderInRouter(
    <SidebarView
      beatCount={60}
      running={{ label: "Rendering", percent: 10, title: "Ninety" }}
      queue={{ count: 49, partial: true }}
      status="connected"
    />,
  );

  expect(screen.getByTestId("running-job")).toHaveTextContent(
    "Then: 49+ beats queued",
  );
});

test("a paused Job with Beats behind it still reports the queue", () => {
  const jobs = [
    job({ id: "a", status: "paused", kind: "upload", beat_id: "b1" }),
    job({ id: "b", kind: "upload", beat_id: "b2" }),
    job({ id: "c", kind: "upload", beat_id: "b3" }),
    job({ id: "d", kind: "render", beat_id: "b4" }),
  ];
  const { running, queue } = pickRunning(jobs, () => null);

  expect(running).toBeNull();
  expect(queue).toEqual({ count: 3, partial: false });
});

test("the queue counts Beats, not channel-wide Jobs, and counts each Beat once", () => {
  const jobs = [
    job({ id: "a", kind: "stats" }),
    job({ id: "b", kind: "sync" }),
    job({ id: "c", kind: "render", beat_id: "b1" }),
    job({ id: "d", kind: "upload", beat_id: "b1" }),
  ];

  expect(pickRunning(jobs, () => null).queue).toEqual({
    count: 1,
    partial: false,
  });
});

test("a running Beat Job is shown ahead of a running stats pull", () => {
  const jobs = [
    job({ id: "a", status: "running", kind: "stats", progress: 0.4 }),
    job({
      id: "b",
      status: "running",
      kind: "render",
      progress: 0.2,
      beat_id: "b1",
    }),
  ];

  expect(pickRunning(jobs, () => "Ninety").running).toEqual({
    label: "Rendering",
    percent: 20,
    title: "Ninety",
  });
});

test("a full page of Jobs makes the queued count a floor", () => {
  const jobs = Array.from({ length: JOBS_PAGE_LIMIT }, (_, i) =>
    job({ id: `j${i}`, kind: "upload", beat_id: `b${i}` }),
  );

  expect(pickRunning(jobs, () => null).queue).toEqual({
    count: JOBS_PAGE_LIMIT,
    partial: true,
  });
});

test("the Beat count slot is filled while loading and when the Library fails", () => {
  const { unmount } = renderInRouter(
    <SidebarView
      beatCount={undefined}
      running={null}
      queue={{ count: 0, partial: false }}
      status="connected"
    />,
  );
  expect(screen.getByRole("link", { name: /Library/ })).toHaveTextContent(
    "\u2026",
  );
  unmount();

  renderInRouter(
    <SidebarView
      beatCount={null}
      running={null}
      queue={{ count: 0, partial: false }}
      status="connected"
    />,
  );
  expect(screen.getByRole("link", { name: /Library/ })).toHaveTextContent(
    "\u2014",
  );
});
