import { sharedTags, tagsLength, titleFit } from "./metadata";

test("tagsLength counts the characters YouTube counts", () => {
  expect(tagsLength(["uk drill", "type beat"])).toBe(17);
  expect(tagsLength([])).toBe(0);
});

test("titleFit: fits, cut in a search result, too long for YouTube", () => {
  expect(titleFit("Ninety")).toEqual({ verdict: "fits", chars: 6 });
  expect(titleFit("x".repeat(70))).toEqual({ verdict: "fits", chars: 70 });
  expect(titleFit("x".repeat(71))).toEqual({ verdict: "cut in search", chars: 71 });
  expect(titleFit("x".repeat(101))).toEqual({ verdict: "too long", chars: 101 });
});

const library = [
  { id: "b1", title: "Ninety", tags: ["uk drill", "type beat"] },
  { id: "b2", title: "Velvet", tags: ["UK Drill", "type beat", "free"] },
  { id: "b3", title: "Static", tags: ["trap"] },
];

test("sharedTags picks the beat with the most tags in common, case-blind", () => {
  expect(sharedTags(["uk drill", "type beat", "2026"], library, "b1")).toEqual({
    title: "Velvet",
    shared: 2,
    total: 3,
  });
});

test("sharedTags ignores the beat itself and answers null when nothing overlaps", () => {
  expect(sharedTags(["ambient"], library, "b1")).toBeNull();
  expect(sharedTags([], library, "b1")).toBeNull();
  expect(sharedTags(["trap"], library, "b3")).toBeNull();
});
