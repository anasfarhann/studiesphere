import { describe, expect, it } from "vitest";
import type { StrokeEl } from "../model/types";
import { outlineToPath, strokeOutline } from "./stroke-path";

const stroke: StrokeEl = {
  id: "s1", z: 1, updatedAt: 1, type: "stroke", tool: "pen", color: "#000", size: 4,
  points: [[0, 0, 0.5], [50, 50, 0.5]], simulatePressure: false,
};

describe("strokeOutline", () => {
  it("returns a closed polygon with at least 4 points for a 2-point stroke", () => {
    const outline = strokeOutline(stroke);
    expect(outline.length).toBeGreaterThanOrEqual(4);
    for (const p of outline) expect(p).toHaveLength(2);
  });

  it("makes highlighter strokes 3x wider", () => {
    const pen = strokeOutline(stroke);
    const hl = strokeOutline({ ...stroke, tool: "highlighter" });
    const width = (o: number[][]) => Math.max(...o.map((p) => p[0])) - Math.min(...o.map((p) => p[0]));
    expect(width(hl)).toBeGreaterThan(width(pen));
  });
});

describe("strokeOutline width", () => {
  const flat: StrokeEl = {
    id: "h", z: 1, updatedAt: 1, type: "stroke", tool: "highlighter", color: "#ff0", size: 18,
    points: [[0, 0, 0.5], [100, 0, 0.5]], simulatePressure: false,
  };
  const height = (o: number[][]) => Math.max(...o.map((p) => p[1])) - Math.min(...o.map((p) => p[1]));

  it("draws a new highlighter (sizeMode px) at exactly the slider value", () => {
    for (const size of [4, 18, 60]) expect(height(strokeOutline({ ...flat, size, sizeMode: "px" }))).toBeCloseTo(size, 1);
  });

  it("keeps a legacy highlighter (no sizeMode) at 3x its stored size, pixel-identical to before", () => {
    const legacy = strokeOutline(flat);
    expect(height(legacy)).toBeCloseTo(54, 1);
    // Same outline as a 54-wide "px" stroke: the old size * 3 rule, unchanged.
    expect(legacy).toEqual(strokeOutline({ ...flat, size: 54, sizeMode: "px" }));
  });

  it("pens are unaffected by the marker", () => {
    expect(height(strokeOutline({ ...flat, tool: "pen" }))).toBeCloseTo(18, 1);
  });
});

describe("outlineToPath", () => {
  it("builds a path via the injected factory", () => {
    const calls: string[] = [];
    class FakePath {
      moveTo() { calls.push("m"); }
      lineTo() { calls.push("l"); }
      quadraticCurveTo() { calls.push("q"); }
      closePath() { calls.push("z"); }
    }
    const path = outlineToPath([[0, 0], [1, 0], [1, 1], [0, 1]], () => new FakePath() as unknown as Path2D);
    expect(path).toBeInstanceOf(FakePath);
    expect(calls[0]).toBe("m");
    expect(calls[calls.length - 1]).toBe("z");
  });
});
