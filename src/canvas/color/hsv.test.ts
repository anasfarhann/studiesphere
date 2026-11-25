import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, normalizeHex } from "./hsv";

describe("hsv", () => {
  it("converts primaries and greys", () => {
    expect(hsvToHex(0, 1, 1)).toBe("#ff0000");
    expect(hsvToHex(120, 1, 1)).toBe("#00ff00");
    expect(hsvToHex(240, 1, 1)).toBe("#0000ff");
    expect(hsvToHex(0, 0, 0)).toBe("#000000");
    expect(hsvToHex(200, 0, 1)).toBe("#ffffff");
    expect(hsvToHex(360, 1, 1)).toBe("#ff0000");
  });

  it("round-trips hex through hsv", () => {
    for (const hex of ["#00aa55", "#1b1a1f", "#2563eb", "#dc2626", "#f4d35e", "#8be0a4", "#f6a5c0", "#123456", "#ffffff", "#000000"]) {
      const c = hexToHsv(hex);
      expect(c).not.toBeNull();
      expect(hsvToHex(c!.h, c!.s, c!.v)).toBe(hex);
    }
  });

  it("hexToHsv rejects invalid input", () => {
    expect(hexToHsv("nope")).toBeNull();
    expect(hexToHsv("#12")).toBeNull();
  });

  it("normalizeHex accepts #abc, abc and #AABBCC and rejects the rest", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("abc")).toBe("#aabbcc");
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
    expect(normalizeHex("  00AA55 ")).toBe("#00aa55");
    for (const bad of ["", "#", "#ab", "#abcd", "#abcdeg", "##aabbcc", "#aabbccd", "rgb(1,2,3)"]) expect(normalizeHex(bad)).toBeNull();
  });
});
