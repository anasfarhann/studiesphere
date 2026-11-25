import { describe, expect, it } from "vitest";
import { recognizeShape, type RecognizedShape } from "./recognize-shape";

type P = [number, number];

/** Deterministic PRNG (mulberry32) so jittered fixtures are stable. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Samples a polyline every `step` units with +-`amp` jitter, like a hand drawing it. */
function trace(vertices: P[], { step = 3, amp = 1.5, seed = 1 } = {}): P[] {
  const r = rng(seed);
  const out: P[] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const [ax, ay] = vertices[i];
    const [bx, by] = vertices[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([ax + (bx - ax) * t + (r() - 0.5) * 2 * amp, ay + (by - ay) * t + (r() - 0.5) * 2 * amp]);
    }
  }
  const [lx, ly] = vertices[vertices.length - 1];
  out.push([lx + (r() - 0.5) * 2 * amp, ly + (r() - 0.5) * 2 * amp]);
  return out;
}

function rotate(pts: P[], deg: number, [cx, cy]: P = [0, 0]): P[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}

function ellipse(cx: number, cy: number, rx: number, ry: number, { from = 0, sweep = 360, n = 120, amp = 1.5, seed = 1 } = {}): P[] {
  const r = rng(seed);
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((from + (sweep * i) / n) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a) + (r() - 0.5) * 2 * amp, cy + ry * Math.sin(a) + (r() - 0.5) * 2 * amp]);
  }
  return out;
}

function maxGap(pts: P[]): number {
  let g = 0;
  for (let i = 1; i < pts.length; i++) g = Math.max(g, Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return g;
}

function bbox(pts: P[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** The corners of a densified polygon: points where the direction changes. */
function corners(shape: RecognizedShape): P[] {
  const pts = shape.points.slice(0, -1); // closed: last point repeats the first
  const n = pts.length;
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (len > 0 && Math.abs(cross / len) > 0.05) out.push(b);
  }
  return out;
}

function expectDense(shape: RecognizedShape) {
  expect(maxGap(shape.points)).toBeLessThanOrEqual(4 + 1e-9);
}

function expectClosed(shape: RecognizedShape) {
  expect(shape.points[shape.points.length - 1]).toEqual(shape.points[0]);
}

const RECT: P[] = [[0, 0], [200, 0], [200, 120], [0, 120], [0, 0]];
const SQUARE: P[] = [[0, 0], [150, 0], [150, 150], [0, 150], [0, 0]];
const TRIANGLE: P[] = [[0, 150], [90, 0], [180, 150], [0, 150]];

describe("recognizeShape", () => {
  it("recognises a jittered line and keeps its end points", () => {
    const shape = recognizeShape(trace([[10, 20], [310, 120]]));
    expect(shape?.kind).toBe("line");
    expectDense(shape!);
    const a = shape!.points[0];
    const b = shape!.points[shape!.points.length - 1];
    expect(Math.hypot(a[0] - 10, a[1] - 20)).toBeLessThan(4);
    expect(Math.hypot(b[0] - 310, b[1] - 120)).toBeLessThan(4);
    // Perfectly straight: every point on the a-b line.
    for (const p of shape!.points) {
      const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      expect(Math.abs(cross) / Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(1e-6);
    }
  });

  it("recognises an axis-aligned rectangle with exact right angles", () => {
    const shape = recognizeShape(trace(RECT, { seed: 2 }));
    expect(shape?.kind).toBe("rectangle");
    expectClosed(shape!);
    expectDense(shape!);
    const c = corners(shape!);
    expect(c).toHaveLength(4);
    const b = bbox(shape!.points);
    expect(b.maxX - b.minX).toBeGreaterThan(190);
    expect(b.maxX - b.minX).toBeLessThan(210);
    expect(b.maxY - b.minY).toBeGreaterThan(110);
    expect(b.maxY - b.minY).toBeLessThan(130);
    // Axis-aligned: each corner shares x with one other and y with another.
    for (const p of c) {
      expect(c.filter((q) => Math.abs(q[0] - p[0]) < 1e-6)).toHaveLength(2);
      expect(c.filter((q) => Math.abs(q[1] - p[1]) < 1e-6)).toHaveLength(2);
    }
  });

  it("keeps the rotation of a rotated rectangle", () => {
    const shape = recognizeShape(trace(rotate(RECT, 30, [100, 60]), { seed: 3 }));
    expect(shape?.kind).toBe("rectangle");
    expectClosed(shape!);
    expectDense(shape!);
    const c = corners(shape!);
    expect(c).toHaveLength(4);
    const angle = (Math.atan2(c[1][1] - c[0][1], c[1][0] - c[0][0]) * 180) / Math.PI;
    const mod = ((angle % 90) + 90) % 90;
    expect(Math.min(Math.abs(mod - 30), Math.abs(mod - 30 + 90), Math.abs(mod - 30 - 90))).toBeLessThan(4);
    // Right angles at every corner.
    for (let i = 0; i < 4; i++) {
      const a = c[(i + 3) % 4];
      const b = c[i];
      const d = c[(i + 1) % 4];
      const dot = (a[0] - b[0]) * (d[0] - b[0]) + (a[1] - b[1]) * (d[1] - b[1]);
      expect(Math.abs(dot)).toBeLessThan(1e-6);
    }
  });

  it("recognises a square (sides within 10%) with equal sides", () => {
    const shape = recognizeShape(trace([[0, 0], [150, 0], [150, 140], [0, 140], [0, 0]], { seed: 4 }));
    expect(shape?.kind).toBe("square");
    expectClosed(shape!);
    expectDense(shape!);
    const b = bbox(shape!.points);
    expect(b.maxX - b.minX).toBeCloseTo(b.maxY - b.minY, 6);
  });

  it("a clear square is a square, a 2:1 box is a rectangle", () => {
    expect(recognizeShape(trace(SQUARE, { seed: 5 }))?.kind).toBe("square");
    expect(recognizeShape(trace([[0, 0], [200, 0], [200, 100], [0, 100], [0, 0]], { seed: 6 }))?.kind).toBe("rectangle");
  });

  it("recognises a circle, starting anywhere and with a small gap or overshoot", () => {
    for (const [from, sweep, seed] of [[0, 360, 7], [90, 345, 8], [200, 380, 9]] as const) {
      const shape = recognizeShape(ellipse(100, 100, 80, 80, { from, sweep, seed }));
      expect(shape?.kind).toBe("circle");
      expectClosed(shape!);
      expectDense(shape!);
      for (const p of shape!.points) expect(Math.abs(Math.hypot(p[0] - 100, p[1] - 100) - 80)).toBeLessThan(3);
    }
  });

  it("a near-equal-axis ellipse becomes a circle; a flat ellipse is not recognised", () => {
    expect(recognizeShape(ellipse(100, 100, 85, 78, { seed: 10 }))?.kind).toBe("circle");
    expect(recognizeShape(ellipse(100, 100, 120, 50, { seed: 11 }))).toBeNull();
  });

  it("recognises a triangle with its three corners near the drawn ones", () => {
    const shape = recognizeShape(trace(TRIANGLE, { seed: 12 }));
    expect(shape?.kind).toBe("triangle");
    expectClosed(shape!);
    expectDense(shape!);
    const c = corners(shape!);
    expect(c).toHaveLength(3);
    for (const v of TRIANGLE.slice(0, 3)) expect(Math.min(...c.map((p) => Math.hypot(p[0] - v[0], p[1] - v[1])))).toBeLessThan(8);
  });

  it("returns null for a squiggle", () => {
    const r = rng(13);
    const pts: P[] = [];
    for (let i = 0; i < 120; i++) pts.push([i * 3, Math.sin(i / 4) * 30 + (r() - 0.5) * 3]);
    expect(recognizeShape(pts)).toBeNull();
  });

  it("returns null for a cursive word held still at the end (a low wave)", () => {
    // "minimum" in cursive: ~200 wide, ~12 tall, one hump per stroke of m/i/n/u (15 humps).
    const r = rng(21);
    const word: P[] = [];
    for (let x = 0; x <= 200; x += 1.5) word.push([40 + x, 300 + 6 * Math.sin((x / 200) * Math.PI * 2 * 15) + (r() - 0.5) * 0.8]);
    expect(recognizeShape(word)).toBeNull();
    // Slanted, with uneven humps.
    expect(recognizeShape(rotate(word.map(([x, y], i) => [x, y + 2 * Math.sin(i / 7)] as P), -8, [140, 300]))).toBeNull();
  });

  it("returns null for back-and-forth hatching", () => {
    // Five passes over the same band, drifting 2 units sideways each time, ending at the far end.
    const hatch = trace([[0, 0], [150, 2], [0, 4], [150, 6], [0, 8], [150, 10]], { amp: 0.8, seed: 22 });
    expect(recognizeShape(hatch)).toBeNull();
    // Two quick strokes back and forth on a long line, too.
    expect(recognizeShape(trace([[0, 0], [200, 4], [60, 2], [220, 6]], { amp: 0.8, seed: 23 }))).toBeNull();
  });

  it("a slowly drawn, slightly wavy line is still a line", () => {
    const pts: P[] = [];
    for (let x = 0; x <= 240; x += 2) pts.push([x, 50 + 2 * Math.sin(x / 40)]);
    expect(recognizeShape(pts)?.kind).toBe("line");
  });

  it("returns null for a handwritten 'a'", () => {
    // Bowl drawn anticlockwise from the top right, back up, then the stem down with a small tail.
    const bowl = ellipse(30, 40, 25, 28, { from: -40, sweep: -320, n: 50, amp: 0.8, seed: 14 }).map(([x, y]) => [x, y] as P);
    const stem = trace([[50, 18], [52, 66], [60, 72]], { step: 2, amp: 0.6, seed: 15 });
    expect(recognizeShape([...bowl, ...stem])).toBeNull();
  });

  it("returns null for an open U", () => {
    const u = trace([[0, 0], [0, 120], [100, 120], [100, 0]], { seed: 16 });
    expect(recognizeShape(u)).toBeNull();
    expect(recognizeShape(ellipse(100, 0, 60, 80, { from: 0, sweep: 180, seed: 17 }))).toBeNull();
  });

  it("returns null for a pentagon, a trapezoid and tiny or degenerate input", () => {
    const pent: P[] = Array.from({ length: 6 }, (_, i) => [100 + 80 * Math.cos((i * 2 * Math.PI) / 5), 100 + 80 * Math.sin((i * 2 * Math.PI) / 5)]);
    expect(recognizeShape(trace(pent, { seed: 18 }))).toBeNull();
    expect(recognizeShape(trace([[40, 0], [160, 0], [200, 120], [0, 120], [40, 0]], { seed: 19 }))).toBeNull();
    expect(recognizeShape([])).toBeNull();
    expect(recognizeShape([[5, 5]])).toBeNull();
    expect(recognizeShape([[5, 5], [5.5, 5.2], [5.1, 5.4]])).toBeNull();
  });

  it("is robust over many jitter seeds", () => {
    let ok = 0;
    for (let seed = 100; seed < 120; seed++) {
      if (recognizeShape(trace(RECT, { seed }))?.kind === "rectangle") ok++;
      if (recognizeShape(trace(TRIANGLE, { seed }))?.kind === "triangle") ok++;
      if (recognizeShape(ellipse(0, 0, 70, 70, { seed }))?.kind === "circle") ok++;
      if (recognizeShape(trace([[0, 0], [250, -40]], { seed }))?.kind === "line") ok++;
    }
    expect(ok).toBe(80);
  });
});
