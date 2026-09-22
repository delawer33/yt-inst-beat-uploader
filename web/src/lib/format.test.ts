import { formatViews } from "./format";

test("formatViews", () => {
  expect(formatViews(0)).toBe("0");
  expect(formatViews(999)).toBe("999");
  expect(formatViews(1000)).toBe("1K");
  expect(formatViews(1234)).toBe("1.2K");
  expect(formatViews(1_500_000)).toBe("1.5M");
});
