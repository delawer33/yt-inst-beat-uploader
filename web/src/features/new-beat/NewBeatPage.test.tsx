import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { NewBeatPage } from "./NewBeatPage";

vi.mock("@/api/client", () => ({ api: {} }));

// jsdom's AbortSignal is not undici's, so a real router navigation throws in tests.
const navigate = vi.fn();
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigate,
}));

const mp3 = (name = "beat.mp3") => new File(["x"], name, { type: "audio/mpeg" });
const png = (name = "cover.png") => new File(["x"], name, { type: "image/png" });

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/beats/new"]}>
        <NewBeatPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function created() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ id: "b1" }), { status: 201 }));
}

afterEach(() => vi.restoreAllMocks());

test("the Draft is created the moment both files are there, with no button to press", async () => {
  const fetchMock = created();
  renderPage();
  expect(screen.queryByRole("button", { name: /create/i })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Choose audio file"), { target: { files: [mp3()] } });
  expect(screen.getByText(/beat\.mp3/)).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Choose cover image file"), {
    target: { files: [png()] },
  });

  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/beats/b1"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = fetchMock.mock.calls[0][1]?.body as FormData;
  expect((body.get("audio") as File).name).toBe("beat.mp3");
  expect((body.get("image") as File).name).toBe("cover.png");
});

test("dropping both files onto one zone creates the Draft too", async () => {
  const fetchMock = created();
  renderPage();
  fireEvent.drop(screen.getByRole("button", { name: "Choose audio" }), {
    dataTransfer: { files: [png(), mp3()] },
  });
  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/beats/b1"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("a bad drop shows a note and keeps what was chosen; nothing is created", () => {
  const fetchMock = created();
  renderPage();
  fireEvent.change(screen.getByLabelText("Choose audio file"), { target: { files: [mp3()] } });
  fireEvent.drop(screen.getByRole("button", { name: /cover image/i }), {
    dataTransfer: { files: [png("a.png"), png("b.png")] },
  });

  expect(screen.getByRole("alert")).toHaveTextContent("One image only, got 2: a.png, b.png.");
  expect(screen.getByText(/beat\.mp3/)).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("a refused upload shows the server's reason and lets the files be replaced", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ detail: "Audio is empty." }), { status: 400 }),
  );
  renderPage();
  fireEvent.change(screen.getByLabelText("Choose audio file"), { target: { files: [mp3()] } });
  fireEvent.change(screen.getByLabelText("Choose cover image file"), {
    target: { files: [png()] },
  });

  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Audio is empty."));
  expect(navigate).not.toHaveBeenCalled();
});
