import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { NewBeatPage } from "./NewBeatPage";

const api = vi.hoisted(() => ({ POST: vi.fn() }));
vi.mock("@/api/client", () => ({ api }));

// jsdom's AbortSignal is not undici's, so a real router navigation throws in tests.
const navigate = vi.fn();
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigate,
}));

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/beats/new"]}>
        <NewBeatPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const PATH = "/home/me/bounces/Jungle_104bpm_Amin_calm";

afterEach(() => vi.resetAllMocks());

function typePath(value: string) {
  fireEvent.change(screen.getByLabelText("Bounce Folder path"), { target: { value } });
}

test("one path field and no file drop", () => {
  renderPage();
  expect(screen.getByLabelText("Bounce Folder path")).toBeInTheDocument();
  expect(screen.queryByLabelText(/choose audio/i)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
});

test("Create sends the trimmed path and opens the Draft", async () => {
  api.POST.mockResolvedValue({ data: { id: "b1" }, response: { ok: true } });
  renderPage();
  typePath(`  ${PATH}  `);
  fireEvent.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() => expect(navigate).toHaveBeenCalledWith("/beats/b1"));
  expect(api.POST).toHaveBeenCalledWith("/api/beats/from-folder", { body: { path: PATH } });
});

test("a refused folder shows the server's reason and stays on the page", async () => {
  api.POST.mockResolvedValue({
    error: { detail: `No WAV in ${PATH}.` },
    response: { ok: false },
  });
  renderPage();
  typePath(PATH);
  fireEvent.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No WAV in"));
  expect(navigate).not.toHaveBeenCalled();
});
