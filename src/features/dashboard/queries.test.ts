import { describe, expect, it } from "vitest";
import { pickRecent, resolveDisplayName } from "./queries";

describe("pickRecent", () => {
  it("takes the first distinct page ids in order with their newest time", () => {
    const rows = [
      { page_id: "a", updated_at: "2026-11-23T10:00:00Z" },
      { page_id: "a", updated_at: "2026-11-23T09:00:00Z" },
      { page_id: "b", updated_at: "2026-11-22T10:00:00Z" },
      { page_id: "c", updated_at: "2026-11-21T10:00:00Z" },
      { page_id: "d", updated_at: "2026-11-20T10:00:00Z" },
    ];
    expect(pickRecent(rows, 3)).toEqual([
      { pageId: "a", editedAt: "2026-11-23T10:00:00Z" },
      { pageId: "b", editedAt: "2026-11-22T10:00:00Z" },
      { pageId: "c", editedAt: "2026-11-21T10:00:00Z" },
    ]);
  });
  it("returns [] for no rows", () => expect(pickRecent([], 3)).toEqual([]));
});

describe("resolveDisplayName", () => {
  it("prefers the profile name, then the email local part, never empty", () => {
    expect(resolveDisplayName(" Anas ", "a@b.co")).toBe("Anas");
    expect(resolveDisplayName(null, "sam@b.co")).toBe("sam");
    expect(resolveDisplayName("  ", "")).toBe("there");
    expect(resolveDisplayName(undefined, undefined)).toBe("there");
    expect(resolveDisplayName(null, "@b.co")).toBe("there");
  });
});
