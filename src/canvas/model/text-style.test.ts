import { describe, expect, it } from "vitest";
import type { TextEl } from "./types";
import { cssFont } from "./text-style";

const legacy: TextEl = { id: "t", z: 0, updatedAt: 1, type: "text", x: 0, y: 0, w: 100, text: "hi", fontSize: 18, color: "#000" };

describe("cssFont", () => {
  it("gives exactly today's string for a legacy element without the new fields", () => {
    expect(cssFont(legacy, legacy.fontSize)).toBe("18px sans-serif");
    expect(cssFont(JSON.parse(JSON.stringify(legacy)), 18)).toBe("18px sans-serif");
  });
  it("builds weight, style and family from the fields", () => {
    expect(cssFont({ font: "serif", bold: true }, 20)).toBe("bold 20px Lora, serif");
    expect(cssFont({ font: "mono", italic: true }, 16)).toBe('italic 16px "JetBrains Mono", monospace');
    expect(cssFont({ font: "hand", bold: true, italic: true }, 30)).toBe("italic bold 30px Caveat, cursive");
    expect(cssFont({ font: "sans" }, 20)).toBe('20px "DM Sans Variable", sans-serif');
  });
  it("ignores underline (drawn separately)", () => {
    expect(cssFont({ underline: true }, 18)).toBe("18px sans-serif");
  });
});
