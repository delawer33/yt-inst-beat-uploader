import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Beat } from "@/features/library/queries";
import { AUTOSAVE_MS, DraftBeatPage } from "./DraftBeatPage";

const api = vi.hoisted(() => ({
  GET: vi.fn(),
  PATCH: vi.fn(),
  POST: vi.fn(),
  DELETE: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigate,
}));

const draft: Beat = {
  id: "b1",
  status: "draft",
  title: "Ninety",
  description: "Free for non-profit.",
  tags: ["uk drill"],
  category_id: 10,
  privacy: "public",
  youtube_id: null,
  youtube_url: null,
  published_at: null,
  publish_at: null,
  views: 0,
  likes: 0,
  comments: 0,
  has_files: true,
  source_name: "Dmin110.mp3",
  cover_style: "purple_yellow_5tone",
  video_style: null,
  rendered: true,
  active_job: null,
  cover_url: "/api/beats/b1/cover",
  synced_at: null,
  created_at: "2026-09-24T10:00:00",
  updated_at: "2026-09-24T10:00:00",
};

function renderPage(beat: Beat = draft) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DraftBeatPage beat={beat} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.GET.mockImplementation(async (path: string) => {
    if (path === "/api/beats") return { data: [draft] };
    if (path === "/api/jobs") return { data: [] };
    if (path === "/api/auth/status") return { data: { status: "connected", channel: null } };
    return { data: null, error: { detail: `unexpected GET ${path}` } };
  });
  api.POST.mockResolvedValue({ data: { ...draft, status: "queued" } });
  api.DELETE.mockResolvedValue({ data: null, error: undefined });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const title = () => screen.getByLabelText(/^Title/);
const send = () => screen.getByRole("button", { name: /Save & upload when rendered/ });

/**
 * The race the app's main flow used to lose: an autosave armed 300 ms before the send fires
 * while the send's own PATCH is still in flight. Sharing one mutation observer meant that
 * second `mutate()` replaced the send's `onSuccess`, and the upload was never asked for.
 */
test("an autosave armed before the send cannot cancel the upload", async () => {
  vi.useFakeTimers();
  let finishPatch: (() => void) | null = null;
  api.PATCH.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishPatch = () => resolve({ data: { ...draft, title: "Static" } });
      }),
  );

  renderPage();
  fireEvent.change(title(), { target: { value: "Static" } });

  // 300 ms in, the owner presses the button; the autosave would have fired at 800 ms.
  await vi.advanceTimersByTimeAsync(300);
  fireEvent.click(send());
  await vi.advanceTimersByTimeAsync(0);
  expect(api.PATCH).toHaveBeenCalledTimes(1);

  // The PATCH takes longer than the rest of the debounce.
  await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
  expect(api.PATCH).toHaveBeenCalledTimes(1);
  expect(api.POST).not.toHaveBeenCalled();

  finishPatch!();
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();

  await waitFor(() =>
    expect(api.POST).toHaveBeenCalledWith("/api/beats/{beat_id}/upload", {
      params: { path: { beat_id: "b1" } },
    }),
  );
});

test("a send with nothing edited goes straight to the upload", async () => {
  renderPage();
  fireEvent.click(send());
  await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(1));
  expect(api.PATCH).not.toHaveBeenCalled();
});

test("Delete draft removes the Beat and goes back to the Library", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  renderPage();
  fireEvent.click(screen.getByRole("button", { name: "Delete draft" }));

  await waitFor(() =>
    expect(api.DELETE).toHaveBeenCalledWith("/api/beats/{beat_id}", {
      params: { path: { beat_id: "b1" } },
    }),
  );
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
});

/**
 * The other half of the same race: the owner keeps typing after pressing the button, so a
 * fresh autosave really does fire while the send's PATCH is in flight. On a shared observer
 * that second `mutate()` would take the send's `onSuccess` with it.
 */
test("an autosave during the send's PATCH leaves the upload alone", async () => {
  vi.useFakeTimers();
  const settle: (() => void)[] = [];
  api.PATCH.mockImplementation(
    () => new Promise((resolve) => settle.push(() => resolve({ data: draft }))),
  );

  renderPage();
  fireEvent.change(title(), { target: { value: "Static" } });
  await vi.advanceTimersByTimeAsync(AUTOSAVE_MS / 2);
  fireEvent.click(send());
  await vi.advanceTimersByTimeAsync(0);
  expect(api.PATCH).toHaveBeenCalledTimes(1);

  // Still typing: a second autosave arms and fires before the send's PATCH comes back.
  fireEvent.change(title(), { target: { value: "Static Bloom" } });
  await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
  expect(api.PATCH).toHaveBeenCalledTimes(2);
  expect(api.POST).not.toHaveBeenCalled();

  for (const done of settle) done();
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();

  await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(1));
});

const fillButton = () => screen.getByRole("button", { name: /Fill from title/ });
const description = () => screen.getByLabelText(/^Description/);

test("a fill puts the server's answer into the form and the autosave patches it", async () => {
  api.POST.mockImplementation(async (path: string) =>
    path === "/api/beats/{beat_id}/fill"
      ? { data: { description: "Filled.", tags: ["uk drill", "drill type beat"] } }
      : { data: { ...draft, status: "queued" } },
  );
  api.PATCH.mockImplementation(async (_path: string, { body }: { body: object }) => ({
    data: { ...draft, ...body },
  }));
  renderPage();

  fireEvent.click(fillButton());

  await waitFor(() => expect(description()).toHaveValue("Filled."));
  expect(api.POST).toHaveBeenCalledWith("/api/beats/{beat_id}/fill", {
    params: { path: { beat_id: "b1" } },
    body: { title: "Ninety", description: "Free for non-profit.", tags: ["uk drill"] },
  });
  await waitFor(
    () =>
      expect(api.PATCH).toHaveBeenCalledWith("/api/beats/{beat_id}", {
        params: { path: { beat_id: "b1" } },
        body: { description: "Filled.", tags: ["uk drill", "drill type beat"] },
      }),
    { timeout: AUTOSAVE_MS * 3 },
  );
});

test("a failed fill leaves the form and shows the server's note", async () => {
  api.POST.mockResolvedValue({ error: { detail: "`claude` is not logged in for this user." } });
  renderPage();

  fireEvent.click(fillButton());

  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("not logged in"));
  expect(description()).toHaveValue("Free for non-profit.");
  expect(api.PATCH).not.toHaveBeenCalled();
});
