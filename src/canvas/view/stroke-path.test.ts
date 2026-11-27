import { getStroke } from "perfect-freehand";
import { describe, expect, it } from "vitest";
import type { Point, StrokeEl } from "../model/types";
import { outlineToPath, smoothPoints, strokeOutline } from "./stroke-path";

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

describe("smoothPoints", () => {
  it("keeps both endpoints exactly", () => {
    const pts: Point[] = [[0, 0, 0.2], [1, 1, 0.5], [2, 0, 0.5], [3, 1, 0.9]];
    const out = smoothPoints(pts, 2);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
    expect(out).toHaveLength(pts.length);
  });

  it("leaves sparse points (snapped-shape corners) untouched", () => {
    const square: Point[] = [[0, 0, 0.5], [100, 0, 0.5], [100, 100, 0.5], [0, 100, 0.5], [0, 0, 0.5]];
    expect(smoothPoints(square, 2)).toEqual(square);
  });

  it("averages dense neighbours, pressure included", () => {
    const zigzag: Point[] = [0, 1, 2, 3, 4, 5, 6].map((x) => [x, x % 2, x % 2 ? 0.1 : 0.9]);
    const out = smoothPoints(zigzag, 2);
    expect(out[3][1]).toBeLessThan(1);
    expect(out[3][1]).toBeGreaterThan(0);
    expect(out[3][2]).toBeGreaterThan(0.1);
  });

  it("returns short inputs unchanged", () => {
    const two: Point[] = [[0, 0, 0.5], [5, 5, 0.5]];
    expect(smoothPoints(two, 2)).toEqual(two);
  });
});

describe("strokeOutline smoothness", () => {
  // Touch positions rounded to whole pixels, as iOS can report them: a staircase that used to give the
  // outline a beaded, jagged edge.
  function quantizedCircle(step: number): Point[] {
    const pts: Point[] = [];
    const R = 80;
    const n = Math.round((2 * Math.PI * R) / step);
    for (let i = 0; i < n * 0.9; i++) {
      const a = (i / n) * 2 * Math.PI;
      pts.push([Math.round(200 + R * Math.cos(a)), Math.round(200 + R * Math.sin(a)), 0.5]);
    }
    return pts;
  }
  /** Mean |second difference| of the outline's radius: 0 for a perfect ring. */
  function roughness(outline: number[][]): number {
    const r = outline.map(([x, y]) => Math.hypot(x - 200, y - 200));
    let s = 0;
    for (let i = 1; i < r.length - 1; i++) s += Math.abs(r[i - 1] - 2 * r[i] + r[i + 1]);
    return s / r.length;
  }

  it("draws pixel-rounded input with an edge at least twice as smooth as the raw outline (dense samples)", () => {
    for (const step of [0.7, 1.5, 3]) {
      const points = quantizedCircle(step);
      const el: StrokeEl = { ...stroke, size: 6, points, simulatePressure: true };
      const raw = getStroke(points, { size: 6, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: true });
      expect(roughness(strokeOutline(el))).toBeLessThan(roughness(raw) / 2);
    }
  });

  it("barely shrinks a small handwriting loop", () => {
    const loop: Point[] = [];
    for (let i = 0; i < 28; i++) loop.push([200 + 5 * Math.cos(i / 5), 200 + 5 * Math.sin(i / 5), 0.5]);
    const mid = smoothPoints(loop).slice(4, -4).map(([x, y]) => Math.hypot(x - 200, y - 200));
    expect(Math.min(...mid)).toBeGreaterThan(4.5);
  });
});
