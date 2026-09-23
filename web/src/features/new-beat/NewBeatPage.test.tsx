import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
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
  const router = createMemoryRouter([{ path: "/beats/new", element: <NewBeatPage /> }], {
    initialEntries: ["/beats/new"],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

test("audio and cover are picked separately; the button unlocks when both are there", () => {
  renderPage();
  const button = screen.getByRole("button", { name: "Create beat" });
  expect(button).toBeDisabled();

  fireEvent.change(screen.getByLabelText("Choose audio file"), { target: { files: [mp3()] } });
  expect(screen.getByText("beat.mp3")).toBeInTheDocument();
  expect(screen.getByText("Now add the cover image.")).toBeInTheDocument();
  expect(button).toBeDisabled();

  fireEvent.change(screen.getByLabelText("Choose cover image file"), {
    target: { files: [png()] },
  });
  expect(screen.getByText("cover.png")).toBeInTheDocument();
  expect(button).toBeEnabled();
});

test("dropping both files onto one slot fills both", () => {
  renderPage();
  fireEvent.drop(screen.getByRole("button", { name: "Choose audio" }), {
    dataTransfer: { files: [png(), mp3()] },
  });
  expect(screen.getByText("beat.mp3")).toBeInTheDocument();
  expect(screen.getByText("cover.png")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create beat" })).toBeEnabled();
});

test("a bad drop shows an error and keeps what was chosen; remove clears a slot", () => {
  renderPage();
  fireEvent.change(screen.getByLabelText("Choose audio file"), { target: { files: [mp3()] } });
  fireEvent.drop(screen.getByRole("button", { name: /cover image/i }), {
    dataTransfer: { files: [png("a.png"), png("b.png")] },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("One image only, got 2: a.png, b.png.");
  expect(screen.getByText("beat.mp3")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Remove audio" }));
  expect(screen.queryByText("beat.mp3")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("Create beat posts both files and opens the new beat", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "b1" }), { status: 201 }),
  );
  renderPage();
  fireEvent.change(screen.getByLabelText("Choose audio file"), { target: { files: [mp3()] } });
  fireEvent.change(screen.getByLabelText("Choose cover image file"), {
    target: { files: [png()] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create beat" }));

  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/beats/b1"));
  const body = fetchMock.mock.calls[0][1]?.body as FormData;
  expect((body.get("audio") as File).name).toBe("beat.mp3");
  expect((body.get("image") as File).name).toBe("cover.png");
  fetchMock.mockRestore();
});
