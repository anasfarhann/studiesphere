import { describe, expect, it } from "vitest";
import { boundsOf, TEXT_LINE_HEIGHT } from "./bounds";
import { AUTO_TEXT_MAX_W, autoTextWidth, layoutWidth, minTextWidth, textLines } from "./text-layout";
import type { TextEl } from "./types";
import { approxMeasure, approxMeasureFor } from "./wrap-text";

const fixed = (s: string, f: number) => s.length * f * 0.5;
const el = (over: Partial<TextEl>): TextEl => ({
  id: "t", z: 0, updatedAt: 1, type: "text", x: 10, y: 20, w: 320, text: "", fontSize: 20, color: "#000", ...over,
});

describe("autoTextWidth", () => {
  it("a short word is narrow: tens of units at 20px, not 320", () => {
    const w = autoTextWidth(approxMeasureFor({ font: "sans" }), "test", 20);
    expect(w).toBeGreaterThan(40);
    expect(w).toBeLessThan(80);
  });

  it("an empty box is about two em wide, so the caret has room", () => {
    expect(autoTextWidth(fixed, "", 20)).toBe(minTextWidth(20));
    expect(minTextWidth(20)).toBe(40);
  });

  it("sizes to the longest of newline-separated lines", () => {
    const one = autoTextWidth(fixed, "abcdefghijklmnopqrst", 20);
    expect(autoTextWidth(fixed, "ab\nabcdefghijklmnopqrst\nabc", 20)).toBe(one);
    expect(one).toBeGreaterThanOrEqual(fixed("abcdefghijklmnopqrst", 20));
  });

  it("caps at the maximum", () => {
    expect(autoTextWidth(fixed, "word ".repeat(200), 20)).toBe(AUTO_TEXT_MAX_W);
    expect(AUTO_TEXT_MAX_W).toBe(560);
  });
});

describe("text layout", () => {
  it("long auto text wraps at the maximum width", () => {
    const box = el({ autoW: true, text: "word ".repeat(200).trim() });
    expect(layoutWidth(fixed, box)).toBe(560);
    const lines = textLines(fixed, box);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(fixed(l, 20)).toBeLessThanOrEqual(560);
  });

  it("a legacy box (no autoW) wraps at its stored width, exactly as before", () => {
    const box = el({ text: "word ".repeat(40), w: 100 });
    expect(layoutWidth(fixed, box)).toBe(100);
    const b = boundsOf(box);
    expect(b).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 20 + 20 * TEXT_LINE_HEIGHT * textLines(approxMeasure, box).length });
  });

  it("auto box bounds use the stored width and the explicit line count", () => {
    const box = el({ autoW: true, w: 45, text: "test\nab" });
    const b = boundsOf(box);
    expect(b.maxX - b.minX).toBe(45);
    expect(b.maxY - b.minY).toBeCloseTo(2 * 20 * TEXT_LINE_HEIGHT);
  });

  it("a fixed (resized) box wraps inside its width and grows taller", () => {
    const wide = el({ autoW: false, w: 400, text: "alpha beta gamma delta" });
    const narrow = el({ autoW: false, w: 80, text: "alpha beta gamma delta" });
    const h = (e: TextEl) => boundsOf(e).maxY - boundsOf(e).minY;
    expect(h(narrow)).toBeGreaterThan(h(wide));
    expect(boundsOf(narrow).maxX - boundsOf(narrow).minX).toBe(80);
  });
});
