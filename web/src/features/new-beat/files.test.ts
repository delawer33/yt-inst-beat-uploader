import { EMPTY, formatBytes, receive } from "./files";

const mp3 = (name = "beat.mp3") => new File(["x"], name, { type: "audio/mpeg" });
const png = (name = "cover.png") => new File(["x"], name, { type: "image/png" });

test("receive fills slots one file at a time, case-insensitive", () => {
  const first = receive(EMPTY, [mp3("Beat.WAV")]);
  expect("selection" in first && first.selection.audio?.name).toBe("Beat.WAV");
  expect("selection" in first && first.selection.image).toBeNull();
  const second = receive("selection" in first ? first.selection : EMPTY, [png("Cover.JPG")]);
  expect("selection" in second && second.selection.audio?.name).toBe("Beat.WAV");
  expect("selection" in second && second.selection.image?.name).toBe("Cover.JPG");
});

test("receive takes both files at once and replaces an earlier choice", () => {
  const start = { audio: mp3("old.mp3"), image: null };
  const result = receive(start, [png(), mp3("new.mp3")]);
  expect("selection" in result && result.selection.audio?.name).toBe("new.mp3");
  expect("selection" in result && result.selection.image?.name).toBe("cover.png");
});

test.each([
  [[mp3("a.mp3"), mp3("b.mp3")], /One audio file only, got 2: a.mp3, b.mp3/],
  [[png("a.png"), png("b.png")], /One image only, got 2/],
  [[mp3(), new File(["x"], "notes.txt")], /Unsupported file: notes.txt/],
])("receive rejects %# and keeps the selection", (files, message) => {
  const result = receive(EMPTY, files);
  expect("error" in result && result.error).toMatch(message);
});

test("formatBytes", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(20 * 1024)).toBe("20 KB");
  expect(formatBytes(5.25 * 1024 * 1024)).toBe("5.3 MB");
});
