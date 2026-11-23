import { describe, expect, it } from "vitest";
import { PASTELS, toPastel } from "./pastel";

describe("toPastel", () => {
  it("has the six mockup pastels with a stronger dot each", () => {
    expect(PASTELS.map((p) => p.hex)).toEqual(["#F6CFCF", "#F9DFC0", "#DCD6FA", "#C9EEDB", "#CFE3F7", "#F4EBB5"]);
    for (const p of PASTELS) expect(p.dot).not.toBe(p.hex);
  });
  it.each([
    ["#2563eb", "#CFE3F7"],
    ["#16a34a", "#C9EEDB"],
    ["#d97706", "#F9DFC0"],
    ["#dc2626", "#F6CFCF"],
    ["#7c3aed", "#DCD6FA"],
    ["#0d9488", "#C9EEDB"],
  ])("maps legacy %s to %s", (old, expected) => {
    expect(toPastel(old)).toBe(expected);
  });
  it("returns pastels unchanged (case-insensitive) and falls back for unknown values", () => {
    for (const p of PASTELS) expect(toPastel(p.hex)).toBe(p.hex);
    expect(toPastel("#f6cfcf")).toBe("#F6CFCF");
    expect(toPastel("nonsense")).toBe(PASTELS[0].hex);
  });
});
