import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { DropZone, pickFiles } from "./DropZone";

vi.mock("@/api/client", () => ({ api: {} }));

const mp3 = (name = "beat.mp3") => new File(["x"], name, { type: "audio/mpeg" });
const png = (name = "cover.png") => new File(["x"], name, { type: "image/png" });

test("pickFiles accepts exactly one audio and one image, case-insensitive", () => {
  const result = pickFiles([png("Cover.JPG"), mp3("Beat.WAV")]);
  expect("picked" in result && result.picked.audio.name).toBe("Beat.WAV");
  expect("picked" in result && result.picked.image.name).toBe("Cover.JPG");
});

test.each([
  [[mp3("a.mp3"), mp3("b.mp3"), png()], /One audio file only, got 2: a.mp3, b.mp3/],
  [[mp3(), png("a.png"), png("b.png")], /One image only, got 2/],
  [[png()], /Missing the audio file/],
  [[mp3()], /Missing the cover image/],
  [[mp3(), png(), new File(["x"], "notes.txt")], /Unsupported file: notes.txt/],
])("pickFiles rejects %#", (files, message) => {
  const result = pickFiles(files);
  expect("error" in result && result.error).toMatch(message);
});

function renderZone() {
  const router = createMemoryRouter([{ path: "/", element: <DropZone /> }]);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

test("dropping two audio files shows an inline error", () => {
  renderZone();
  const zone = screen.getByRole("button", { name: /Drop an audio file/ });
  fireEvent.drop(zone, { dataTransfer: { files: [mp3("a.mp3"), mp3("b.mp3")] } });
  expect(screen.getByRole("alert")).toHaveTextContent("One audio file only, got 2: a.mp3, b.mp3.");
});

test("picking files through the input reports a missing cover", () => {
  renderZone();
  fireEvent.change(screen.getByLabelText("Choose beat files"), { target: { files: [mp3()] } });
  expect(screen.getByRole("alert")).toHaveTextContent(/Missing the cover image/);
});
