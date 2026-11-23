import { describe, expect, it } from "vitest";
import { formatEdited, formatLongDate } from "./dates";

const today = new Date(2026, 10, 23, 15, 0); // Mon 23 Nov 2026, local
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h).toISOString();

describe("formatEdited", () => {
  it("says today and yesterday by local calendar day", () => {
    expect(formatEdited(at(2026, 10, 23, 0), today)).toBe("edited today");
    expect(formatEdited(at(2026, 10, 22, 23), today)).toBe("edited yesterday");
  });
  it("uses the weekday within the last week", () => {
    expect(formatEdited(at(2026, 10, 20), today)).toBe("edited Friday");
  });
  it("uses day and month beyond a week, adding the year when it differs", () => {
    expect(formatEdited(at(2026, 10, 3), today)).toBe("edited 3 Nov");
    expect(formatEdited(at(2025, 11, 31), today)).toBe("edited 31 Dec 2025");
  });
  it("treats a timestamp slightly in the future as today", () => {
    expect(formatEdited(at(2026, 10, 24, 1), today)).toBe("edited today");
  });
});

describe("formatLongDate", () => {
  it("formats as Monday, 23 November", () => expect(formatLongDate(today)).toBe("Monday, 23 November"));
});
