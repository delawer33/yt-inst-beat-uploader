import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { Job } from "@/api/events";
import { STATUS_FILTERS } from "./filters";
import { LibraryPage } from "./LibraryPage";
import type { Beat } from "./queries";
import { STATUS_LABEL } from "./status";

const mocks = vi.hoisted(() => ({
  beats: [] as unknown[],
  jobs: [] as unknown[],
  authStatus: "connected" as string,
  createBeat: vi.fn(),
  sync: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/api/client", () => ({ api: {} }));

// jsdom's AbortSignal is not undici's, so a real router navigation throws in tests.
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/features/beat/queries", () => ({
  useCreateBeat: () => ({ mutate: mocks.createBeat, isPending: false }),
}));

vi.mock("@/features/jobs/queries", () => ({
  useJobs: () => ({ data: mocks.jobs }),
  useTriggerSync: () => ({ mutate: mocks.sync, isPending: false, error: null }),
}));

vi.mock("@/features/settings/authQueries", () => ({
  GOOGLE_START_URL: "/api/auth/google/start",
  useAuthStatus: () => ({ data: { status: mocks.authStatus } }),
}));

vi.mock("./queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./queries")>()),
  useBeats: () => ({ isPending: false, error: null, data: mocks.beats }),
}));

const job: Job = {
  id: "j1",
  beat_id: "d2",
  kind: "render",
  status: "running",
  progress: 0.5,
  message: "",
  error: null,
  created_at: "2026-09-04T10:00:00",
  started_at: null,
  finished_at: null,
  attempts: 0,
  not_before: null,
};

const beat = (over: Partial<Beat> & { id: string }): Beat => ({
  status: "published",
  title: `Beat ${over.id}`,
  description: "",
  tags: [],
  category_id: 10,
  privacy: "public",
  youtube_id: null,
  youtube_url: null,
  published_at: "2026-09-01T12:00:00",
  publish_at: null,
  views: 100,
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

const LIBRARY: Beat[] = [
  beat({ id: "d1", status: "draft", views: 0, published_at: null, created_at: "2026-09-03T10:00:00" }),
  beat({
    id: "d2",
    status: "draft",
    views: 0,
    published_at: null,
    created_at: "2026-09-04T10:00:00",
    active_job: job,
  }),
  beat({ id: "p1", views: 4200, created_at: "2026-09-01T10:00:00" }),
];

const mp3 = () => new File(["x"], "beat.mp3", { type: "audio/mpeg" });
const png = () => new File(["x"], "cover.png", { type: "image/png" });

function renderPage() {
  const router = createMemoryRouter([{ path: "/", element: <LibraryPage /> }]);
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  mocks.beats = LIBRARY;
  mocks.jobs = [];
  mocks.authStatus = "connected";
  mocks.createBeat.mockReset();
  mocks.sync.mockReset();
  mocks.navigate.mockReset();
  window.localStorage.clear();
});

test("the head counts the beats and sums their views, and offers New beat", () => {
  renderPage();
  expect(screen.getByTestId("library-counts")).toHaveTextContent("3 beats · 4,200 views");
  expect(screen.getByRole("link", { name: "New beat" })).toHaveAttribute("href", "/beats/new");
});

test("the status filter carries its counts and narrows the grid", () => {
  renderPage();
  expect(screen.getByRole("radio", { name: /^Draft/ }).closest("label")).toHaveTextContent("2");
  expect(screen.getByRole("radio", { name: /^Working/ }).closest("label")).toHaveTextContent("1");
  expect(screen.getAllByRole("link", { name: /^Beat / })).toHaveLength(3);

  fireEvent.click(screen.getByRole("radio", { name: /^Working/ }));
  const shown = screen.getAllByRole("link", { name: /^Beat / });
  expect(shown).toHaveLength(1);
  expect(shown[0]).toHaveAttribute("href", "/beats/d2");
});

test("sorting by views reorders the cards", () => {
  renderPage();
  expect(screen.getAllByRole("link", { name: /^Beat / })[0]).toHaveAttribute("href", "/beats/d2");
  fireEvent.click(screen.getByRole("radio", { name: "Views" }));
  expect(screen.getAllByRole("link", { name: /^Beat / })[0]).toHaveAttribute("href", "/beats/p1");
});

test("the list view shows Beat, Status, Views and Published, and the choice survives a reload", () => {
  renderPage();
  fireEvent.click(screen.getByRole("radio", { name: "List view" }));
  const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
  expect(headers).toEqual(["Cover", "Beat", "Status", "Views", "Published"]);
  const row = screen.getByRole("link", { name: "Beat p1" }).closest("tr");
  expect(within(row as HTMLElement).getByText("Published")).toBeInTheDocument();
  expect(row).toHaveTextContent("4.2K");

  cleanup();
  renderPage();
  expect(screen.getByRole("radio", { name: "List view" })).toBeChecked();
  expect(screen.getByRole("table")).toBeInTheDocument();
});

test("dropping an audio and a cover anywhere in the window creates a Draft and opens it", () => {
  renderPage();
  fireEvent.drop(window, { dataTransfer: { files: [mp3(), png()] } });
  expect(mocks.createBeat).toHaveBeenCalledTimes(1);
  const [files, handlers] = mocks.createBeat.mock.calls[0] as [
    { audio: File; image: File },
    { onSuccess: (beat: Beat) => void },
  ];
  expect(files.audio.name).toBe("beat.mp3");
  expect(files.image.name).toBe("cover.png");
  handlers.onSuccess(beat({ id: "new" }));
  expect(mocks.navigate).toHaveBeenCalledWith("/beats/new");
});

test("dropping only the audio explains that a Draft needs both files", () => {
  renderPage();
  fireEvent.drop(window, { dataTransfer: { files: [mp3()] } });
  expect(mocks.createBeat).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(/needs both files/);
});

test("the drop tile takes files from a click as well", () => {
  renderPage();
  fireEvent.change(screen.getByLabelText("Add a beat"), { target: { files: [mp3(), png()] } });
  expect(mocks.createBeat).toHaveBeenCalledTimes(1);
});

test("an empty library offers the hero drop, Connect YouTube and Import channel", () => {
  mocks.beats = [];
  mocks.authStatus = "not_connected";
  renderPage();
  expect(screen.getByText(/Anywhere in this window works/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Connect YouTube" })).toHaveAttribute(
    "href",
    "/api/auth/google/start",
  );
  expect(screen.getByRole("button", { name: "Import channel" })).toBeDisabled();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();

  cleanup();
  mocks.authStatus = "connected";
  renderPage();
  expect(screen.queryByRole("link", { name: "Connect YouTube" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Import channel" }));
  expect(mocks.sync).toHaveBeenCalledTimes(1);
});

test("a Beat whose newest Job failed wears the Failed badge", () => {
  // Same second for both: the send made them together, and the upload is what failed.
  mocks.jobs = [
    { ...job, id: "j-up", beat_id: "d1", kind: "upload", status: "failed", created_at: "2026-09-05T10:00:00" },
    { ...job, id: "j-ren", beat_id: "d1", kind: "render", status: "done", created_at: "2026-09-05T10:00:00" },
  ];
  renderPage();
  const card = screen.getByRole("link", { name: "Beat d1" }).closest(".beat-card");
  expect(within(card as HTMLElement).getByText("Failed")).toBeInTheDocument();
  const other = screen.getByRole("link", { name: "Beat p1" }).closest(".beat-card");
  expect(within(other as HTMLElement).queryByText("Failed")).not.toBeInTheDocument();
});

test("every status has a chip and the chip counts add up to the Library", () => {
  mocks.beats = [
    ...LIBRARY,
    beat({ id: "u1", status: "uploading", created_at: "2026-09-06T10:00:00" }),
    beat({ id: "u2", status: "uploaded", created_at: "2026-09-07T10:00:00" }),
    beat({ id: "s1", status: "scheduled", created_at: "2026-09-08T10:00:00" }),
  ];
  renderPage();
  const counted = STATUS_FILTERS.map((status) => {
    const label = screen.getByRole("radio", { name: new RegExp(`^${STATUS_LABEL[status]}`) });
    return Number(label.closest("label")?.textContent?.replace(/\D/g, "") ?? "0");
  });
  expect(counted.reduce((a, b) => a + b, 0)).toBe(mocks.beats.length);

  fireEvent.click(screen.getByRole("radio", { name: /^Scheduled/ }));
  const shown = screen.getAllByRole("link", { name: /^Beat / });
  expect(shown).toHaveLength(1);
  expect(shown[0]).toHaveAttribute("href", "/beats/s1");
});

test("a second drop while the first Draft is still being created is ignored", () => {
  renderPage();
  fireEvent.drop(window, { dataTransfer: { files: [mp3(), png()] } });
  fireEvent.drop(window, { dataTransfer: { files: [mp3(), png()] } });
  expect(mocks.createBeat).toHaveBeenCalledTimes(1);

  // Once the first Draft has opened, the window takes files again.
  const [, handlers] = mocks.createBeat.mock.calls[0] as [
    unknown,
    { onSuccess: (beat: Beat) => void },
  ];
  handlers.onSuccess(beat({ id: "new" }));
  fireEvent.drop(window, { dataTransfer: { files: [mp3(), png()] } });
  expect(mocks.createBeat).toHaveBeenCalledTimes(2);
});

test("a drag that carries no files leaves the drop target dark", () => {
  renderPage();
  fireEvent.dragEnter(window, { dataTransfer: { types: ["text/uri-list"], files: [] } });
  expect(document.querySelector(".drop.active")).toBeNull();

  fireEvent.dragEnter(window, { dataTransfer: { types: ["Files"], files: [] } });
  expect(document.querySelector(".drop.active")).not.toBeNull();
});
