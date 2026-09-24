import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { SettingsPage } from "./SettingsPage";

const api = vi.hoisted(() => ({
  GET: vi.fn(),
  PUT: vi.fn(),
  POST: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));

const settings = {
  google_client_id: "8123.apps.googleusercontent.com",
  stats_hour: 4,
  port: 8765,
  redirect_uri: "http://127.0.0.1:8765/api/auth/google/callback",
  title_template: "{name} | Free Type Beat",
  description_template: "prod. by me",
  tags_template: ["trap", "free"],
};

const authStatus = {
  status: "connected",
  channel: { id: "UC7Xq", title: "NOVA Beats" },
};

const syncJob = {
  id: "j1",
  beat_id: null,
  kind: "sync",
  status: "running",
  progress: 0.25,
  message: "Reading the channel",
  error: null,
  created_at: "2026-09-24T03:00:00",
  started_at: "2026-09-24T03:00:00",
  finished_at: null,
  attempts: 0,
  not_before: null,
};

const doneJob = { ...syncJob, id: "j0", status: "done", progress: 1, finished_at: "2026-09-24T03:00:02" };

beforeEach(() => {
  vi.clearAllMocks();
  api.GET.mockImplementation(async (path: string) => {
    if (path === "/api/settings") return { data: settings };
    if (path === "/api/auth/status") return { data: authStatus };
    if (path === "/api/jobs") return { data: [doneJob] };
    return { data: null, error: { detail: `unexpected GET ${path}` } };
  });
  api.PUT.mockResolvedValue({ data: settings });
  api.POST.mockResolvedValue({ data: syncJob });
});

function renderPage(entry = "/settings") {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("the three rows render, with the account card and the connection state", async () => {
  renderPage();
  expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  expect(screen.getByText("YouTube")).toBeInTheDocument();
  expect(screen.getByText("Nightly stats")).toBeInTheDocument();
  expect(screen.getByText("Templates")).toBeInTheDocument();

  await waitFor(() =>
    expect(screen.getByTestId("channel-title")).toHaveTextContent("NOVA Beats"),
  );
  expect(screen.getByLabelText("Connection state")).toHaveTextContent("Connected");
  expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
  expect(document.querySelectorAll(".settings-row")).toHaveLength(3);
});

test("the hour and the last run come from the server", async () => {
  renderPage();
  await waitFor(() => expect(screen.getByLabelText(/^Hour/)).toHaveValue(4));
  expect(screen.getByText(/last run/)).not.toHaveTextContent("never");
});

test("Run now triggers the sync and shows the job", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Run now" }));
  await waitFor(() => expect(api.POST).toHaveBeenCalledWith("/api/sync"));

  const job = await screen.findByTestId("sync-job");
  expect(job).toHaveAttribute("data-status", "running");
  expect(job).toHaveTextContent("Reading the channel");
});

test("Run now shows the failure as a note", async () => {
  api.POST.mockResolvedValue({ error: { detail: "YouTube is not connected" } });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Run now" }));
  expect(await screen.findByText("YouTube is not connected")).toBeInTheDocument();
  expect(screen.queryByTestId("sync-job")).not.toBeInTheDocument();
});

test("templates load, edit and save through the settings API", async () => {
  renderPage();
  const title = await screen.findByLabelText(/^Title/);
  await waitFor(() => expect(title).toHaveValue("{name} | Free Type Beat"));
  expect(screen.getByLabelText(/^Tags/)).toHaveValue("trap, free");

  fireEvent.change(title, { target: { value: "{name} (free)" } });
  fireEvent.change(screen.getByLabelText(/^Tags/), { target: { value: "trap , hard," } });
  fireEvent.click(screen.getAllByRole("button", { name: "Save" })[2]);

  await waitFor(() =>
    expect(api.PUT).toHaveBeenCalledWith("/api/settings", {
      body: {
        stats_hour: 4,
        title_template: "{name} (free)",
        description_template: "prod. by me",
        tags_template: ["trap", "hard"],
      },
    }),
  );
});

test("the hour saves on its own", async () => {
  renderPage();
  await waitFor(() => expect(screen.getByLabelText(/^Hour/)).toHaveValue(4));
  fireEvent.change(screen.getByLabelText(/^Hour/), { target: { value: "3" } });
  fireEvent.click(screen.getAllByRole("button", { name: "Save" })[1]);
  await waitFor(() =>
    expect(api.PUT).toHaveBeenCalledWith("/api/settings", { body: { stats_hour: 3 } }),
  );
});

test("the OAuth return says it connected and Dismiss clears the query string", async () => {
  renderPage("/settings?connected=1");
  const toast = await screen.findByRole("status");
  expect(toast).toHaveTextContent("YouTube connected.");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
});

test("a failed OAuth return shows the reason as a note", async () => {
  renderPage("/settings?error=access_denied");
  const note = await screen.findByRole("alert");
  expect(note).toHaveTextContent("Connection failed");
  expect(note).toHaveTextContent("access_denied");
});
