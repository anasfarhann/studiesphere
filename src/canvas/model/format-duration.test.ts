import { expect, it } from "vitest";
import { formatDuration } from "./format-duration";

it("formats m:ss", () => {
  expect(formatDuration(0)).toBe("0:00");
  expect(formatDuration(9_999)).toBe("0:09");
  expect(formatDuration(125_000)).toBe("2:05");
  expect(formatDuration(60 * 60 * 1000)).toBe("60:00");
});
