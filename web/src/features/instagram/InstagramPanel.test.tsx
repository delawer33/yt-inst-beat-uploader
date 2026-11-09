import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Beat } from "@/features/library/queries";
import { InstagramButton } from "./InstagramButton";
import { InstagramPanelView } from "./InstagramPanel";
import type { Instagram } from "./queries";

const beat: Beat = {
  id: "b1",
  status: "draft",
  title: "Ninety",
  description: "",
  tags: [],
  category_id: 10,
  privacy: "private",
  youtube_id: null,
  youtube_url: null,
  published_at: null,
  publish_at: null,
  views: 0,
  likes: 0,
  comments: 0,
  has_files: true,
  source_name: null,
  cover_style: "purple_yellow_5tone",
  video_style: null,
  effect: "still",
  rendered: false,
  active_job: null,
  cover_url: null,
  beatstars: null,
  beatstars_url: null,
  bounce_folder: null,
  instagram_posted: false,
  synced_at: null,
  created_at: "2026-10-13T10:00:00",
  updated_at: "2026-10-13T10:00:00",
};

const reel = (over: Partial<Instagram["reel"]>): Instagram["reel"] => ({
  state: "ready",
  progress: null,
  message: null,
  error: null,
  ...over,
});

const POST: NonNullable<Instagram["post"]> = {
  hook: "this guitar x reggaeton beat is crazy",
  caption: '"Dance With Me" - guitar type beat\n\n#typebeat #prodbydelawer',
  hashtags: ["typebeat", "prodbydelawer"],
  audio_name: "Dance With Me (prod. delawer)",
  alt_text: 'Cover art for "Dance With Me"',
};

const panel = (r: Instagram["reel"], over: Partial<Instagram> = {}): Instagram => ({
  reel: r,
  unknown_artists: [],
  tag_people: [],
  post: null,
  publish_time: null,
  beatstars_url: null,
  posted: false,
  ...over,
});

const view = (r: Instagram["reel"] | null, props = {}, over: Partial<Instagram> = {}) => (
  <MemoryRouter>
    <InstagramPanelView
      panel={r === null ? null : panel(r, over)}
      onShow={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />
  </MemoryRouter>
);

const written = (over: Partial<Instagram> = {}) => view(reel({}), {}, { post: POST, ...over });

test("the Instagram button is hidden for a beat without audio and cover", () => {
  render(<InstagramButton beat={{ ...beat, has_files: false }} />);
  expect(screen.queryByRole("button", { name: "Instagram" })).not.toBeInTheDocument();
});

test("the Instagram button is there for a beat with its files", () => {
  render(<InstagramButton beat={beat} />);
  expect(screen.getByRole("button", { name: "Instagram" })).toBeInTheDocument();
});

test("while the Reel renders the panel shows progress and no Show in folder", () => {
  render(view(reel({ state: "rendering", progress: 0.42 })));
  expect(screen.getByText("42%")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Show in folder/ })).not.toBeInTheDocument();
});

test("once the Reel is ready Show in folder asks the server to open it", () => {
  const onShow = vi.fn();
  const { rerender } = render(view(reel({ state: "rendering", progress: 0.9 }), { onShow }));
  rerender(view(reel({ state: "ready" }), { onShow }));
  fireEvent.click(screen.getByRole("button", { name: /Show in folder/ }));
  expect(onShow).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("90%")).not.toBeInTheDocument();
});

test("a failed Reel shows the reason", () => {
  render(view(reel({ state: "failed", error: "ffmpeg failed" })));
  expect(screen.getByRole("alert")).toHaveTextContent("ffmpeg failed");
});

test("a server error from Show in folder is shown", () => {
  render(
    view(reel({ state: "ready" }), {
      showError: "Beat b1 has no Reel on disk yet.",
    }),
  );
  expect(screen.getByText("Beat b1 has no Reel on disk yet.")).toBeInTheDocument();
});

test("a beat with nothing to make a Reel from says so", () => {
  render(view(reel({ state: "unavailable" })));
  expect(screen.getByText(/no audio and cover/)).toBeInTheDocument();
});

test("a Reel whose Effect waits for the title says so", () => {
  render(view(reel({ state: "untitled" })));
  expect(screen.getByText(/Give the beat its title first/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Show in folder/ })).not.toBeInTheDocument();
});

test("before the post is written the panel offers to write it, and says nothing is copyable", () => {
  const onWrite = vi.fn();
  render(view(reel({}), { onWrite }));
  expect(screen.queryByRole("button", { name: /^Copy/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Write the post/ }));
  expect(onWrite).toHaveBeenCalledTimes(1);
});

test("a title with a Placeholder shows the server's refusal", () => {
  render(
    view(reel({}), {
      writeError: "Title still has [[Artist2]]; fix the title first.",
    }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Title still has [[Artist2]]");
});

test("the fields come in Instagram's order, each with a copy button", () => {
  render(
    written({
      publish_time: "2026-10-15T15:00:00",
      beatstars_url: "https://www.beatstars.com/TK1",
    }),
  );
  const labels = screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"));
  expect(labels).toEqual([
    "On-screen text",
    "Caption",
    "Tag people",
    "Audio name",
    "Alt text",
    "Publish time",
    "Trial reel",
    "BeatStars link",
  ]);
  expect(screen.getByText(POST.hook)).toBeInTheDocument();
  expect(screen.getByText(/Shown to non-followers first/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy Caption" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Copy Trial reel" })).not.toBeInTheDocument();
});

test("a copy button puts the field's text on the clipboard", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  render(written());
  fireEvent.click(screen.getByRole("button", { name: "Copy Caption" }));
  expect(writeText).toHaveBeenCalledWith(POST.caption);
  expect(await screen.findByRole("button", { name: "Copy Caption" })).toHaveTextContent("Copied");
});

test("without a publish time and a BeatStars link those rows are empty or missing", () => {
  render(written());
  expect(screen.getByText("Not set")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy Publish time" })).toBeDisabled();
  expect(screen.queryByRole("group", { name: "BeatStars link" })).not.toBeInTheDocument();
});

test("Write again asks for a new post", () => {
  const onWrite = vi.fn();
  render(
    <MemoryRouter>
      <InstagramPanelView
        panel={panel(reel({}), { post: POST })}
        onShow={vi.fn()}
        onWrite={onWrite}
        onClose={vi.fn()}
      />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Write again" }));
  expect(onWrite).toHaveBeenCalledTimes(1);
});

test("the Posted on Instagram switch reports its change", () => {
  const onPosted = vi.fn();
  render(view(reel({}), { onPosted }));
  const box = screen.getByRole("checkbox", { name: "Posted on Instagram" });
  expect(box).not.toBeChecked();
  fireEvent.click(box);
  expect(onPosted).toHaveBeenCalledWith(true);
});

test("a posted beat shows the switch on", () => {
  render(view(reel({}), {}, { posted: true }));
  expect(screen.getByRole("checkbox", { name: "Posted on Instagram" })).toBeChecked();
});

test("an artist the handles do not know is asked for at the top, and saving sends the handle", () => {
  const onHandle = vi.fn();
  render(view(reel({}), { onHandle }, { unknown_artists: ["Travis Scott", "Guitar"] }));
  const group = screen.getByRole("region", { name: "Artist Handles" });
  expect(group.compareDocumentPosition(screen.getByRole("region", { name: "Reel" }))).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Instagram handle of Travis Scott" }), {
    target: { value: "@travisscott" },
  });
  fireEvent.click(within(screen.getByRole("form", { name: "Travis Scott" })).getByText("Save"));
  expect(onHandle).toHaveBeenCalledWith("Travis Scott", "@travisscott");
});

test("the style option marks a name as no artist", () => {
  const onHandle = vi.fn();
  render(view(reel({}), { onHandle }, { unknown_artists: ["Guitar"] }));
  fireEvent.click(screen.getByRole("button", { name: "Guitar is a style, not an artist" }));
  expect(onHandle).toHaveBeenCalledWith("Guitar", null);
});

test("Save needs a handle", () => {
  render(view(reel({}), {}, { unknown_artists: ["Guitar"] }));
  expect(within(screen.getByRole("form", { name: "Guitar" })).getByText("Save")).toBeDisabled();
});

test("with every artist known there is no question", () => {
  render(view(reel({})));
  expect(screen.queryByRole("region", { name: "Artist Handles" })).not.toBeInTheDocument();
});

test("Tag people shows the handles and copies them", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  render(written({ tag_people: ["@travisscott", "@dontoliver"] }));
  expect(screen.getByText("@travisscott, @dontoliver")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Copy Tag people" }));
  expect(writeText).toHaveBeenCalledWith("@travisscott, @dontoliver");
});

test("Tag people is empty, not copyable, when no artist has a handle", () => {
  render(written());
  expect(screen.getByText("No artist to tag")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy Tag people" })).toBeDisabled();
});
