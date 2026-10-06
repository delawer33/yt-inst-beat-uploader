import { fillHint, placeholdersIn, sendHint } from "./placeholders";

test("placeholdersIn names every marker in order, an unclosed one too", () => {
  expect(placeholdersIn("[[Artist1]] x [[Artist2]] - [[140]]")).toEqual([
    "[[Artist1]]",
    "[[Artist2]]",
    "[[140]]",
  ]);
  expect(placeholdersIn("Nardo Wick x [[Artist2")).toEqual(["[[Artist2"]);
  expect(placeholdersIn("Nardo Wick Type Beat [Hard]")).toEqual([]);
});

test("fillHint names the first Placeholder in the title", () => {
  expect(fillHint("Travis Scott Type Beat x [[Artist2]] | [[Hard Trap]]")).toBe(
    "Title still has [[Artist2]]",
  );
  expect(fillHint("Travis Scott Type Beat")).toBeNull();
});

test("sendHint says where Placeholders are left", () => {
  const clean = { title: "t", description: "d", tags: ["x"] };
  expect(sendHint(clean)).toBeNull();
  expect(sendHint({ ...clean, description: "BPM: [[140]]" })).toBe(
    "Fill the placeholders in the description",
  );
  expect(sendHint({ ...clean, tags: ["[[artist1]] type beat"] })).toBe(
    "Fill the placeholders in the tags",
  );
  expect(sendHint({ title: "[[a]]", description: "[[b]]", tags: [] })).toBe(
    "Fill the placeholders in the title and description",
  );
  expect(sendHint({ title: "[[a]]", description: "[[b]]", tags: ["[[c]]"] })).toBe(
    "Fill the placeholders in the title, description and tags",
  );
});
