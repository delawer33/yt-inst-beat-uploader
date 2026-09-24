import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ReactNode } from "react";
import { SidebarView, pickRunning } from "./Sidebar";
import type { Job } from "@/api/events";

function renderInRouter(node: ReactNode, path = "/") {
  const router = createMemoryRouter([{ path: "*", element: node }], { initialEntries: [path] });
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
    <SidebarView beatCount={64} running={null} queuedCount={0} status="connected" />,
  );

  const library = screen.getByRole("link", { name: /Library/ });
  expect(library).toHaveTextContent("64");
  expect(library).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  expect(screen.getByText("Connected")).toBeInTheDocument();
  expect(screen.queryByTestId("running-job")).not.toBeInTheDocument();
});

test("New beat is not a nav item", () => {
  renderInRouter(<SidebarView beatCount={0} running={null} queuedCount={0} status="connected" />);
  expect(screen.queryByRole("link", { name: /New beat/ })).not.toBeInTheDocument();
});

test("the foot shows the running Job, its percent and what is queued behind it", () => {
  renderInRouter(
    <SidebarView
      beatCount={3}
      running={{ label: "Rendering", percent: 62, title: "Ninety" }}
      queuedCount={2}
      status="expired"
    />,
  );

  const foot = screen.getByTestId("running-job");
  expect(foot).toHaveTextContent("Rendering");
  expect(foot).toHaveTextContent("62%");
  expect(foot).toHaveTextContent("Ninety");
  expect(foot).toHaveTextContent("Then: 2 queued");
  expect(screen.getByText("Expired")).toBeInTheDocument();
});

test("pickRunning takes the running Job, its Beat title and the queued count", () => {
  const jobs = [
    job({ id: "a", status: "running", progress: 0.615, kind: "upload", beat_id: "b1" }),
    job({ id: "b" }),
    job({ id: "c" }),
    job({ id: "d", status: "done" }),
  ];
  const { running, queuedCount } = pickRunning(jobs, (id) => (id === "b1" ? "Ninety" : null));

  expect(running).toEqual({ label: "Uploading", percent: 62, title: "Ninety" });
  expect(queuedCount).toBe(2);
});

test("pickRunning reports nothing running when no Job is", () => {
  expect(pickRunning([job({ status: "done" })], () => null)).toEqual({
    running: null,
    queuedCount: 0,
  });
  expect(pickRunning(undefined, () => null)).toEqual({ running: null, queuedCount: 0 });
});
