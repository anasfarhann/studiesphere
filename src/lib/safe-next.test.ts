import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("keeps relative app paths", () => {
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
    expect(safeNextPath("/app/p/1?x=2#y")).toBe("/app/p/1?x=2#y");
  });
  it("falls back to /app when missing or empty", () => {
    expect(safeNextPath(null)).toBe("/app");
    expect(safeNextPath(undefined)).toBe("/app");
    expect(safeNextPath("")).toBe("/app");
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "evil.example",
    "javascript:alert(1)",
    "/%2F%2Fevil.example",
    "/\tevil",
    " /app",
  ])("rejects %j", (v) => expect(safeNextPath(v)).toBe("/app"));
});
