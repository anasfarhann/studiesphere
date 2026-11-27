import { getStroke } from "perfect-freehand";
import { strokeWidth } from "../model/stroke-style";
import type { Point, StrokeEl } from "../model/types";

export type PathFactory = () => Path2D;

const defaultFactory: PathFactory = () => new Path2D();

/** Neighbours within this distance along the stroke (world units) are averaged; see smoothPoints. */
export const SMOOTH_RADIUS = 4;
/** Sparse input widens the window to cover its neighbours, but never past this (keeps shape corners). */
export const SMOOTH_RADIUS_MAX = 8;

/**
 * Light low-pass over a stroke's points: each point becomes the weighted mean (triangle weights) of the
 * points within `radius` of it, measured along the stroke (widened to twice the local point spacing, up
 * to SMOOTH_RADIUS_MAX, so sparse samples still get neighbours). Removes the pixel staircase and jitter that
 * touch and Pencil input carry (iOS can report whole-pixel positions), which otherwise shows up as a
 * beaded, jagged outline. Points farther apart than `radius` do not mix, so snapped shapes keep their
 * corners; endpoints stay exact. O(n · neighbours); allocates one new array.
 */
export function smoothPoints(points: Point[], radius = SMOOTH_RADIUS): Point[] {
  const n = points.length;
  if (n < 3 || radius <= 0) return points;
  // Cumulative arc length, so the window is measured along the stroke, not straight-line.
  const arc = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    arc[i] = arc[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  const out: Point[] = new Array(n);
  out[0] = points[0];
  out[n - 1] = points[n - 1];
  for (let i = 1; i < n - 1; i++) {
    // Shrink the window near the ends so the average stays centred and endpoints are not pulled inward.
    const gap = Math.max(arc[i] - arc[i - 1], arc[i + 1] - arc[i]);
    const wide = Math.max(radius, Math.min(SMOOTH_RADIUS_MAX, 2 * gap));
    const r = Math.min(wide, arc[i], arc[n - 1] - arc[i]);
    let x = points[i][0], y = points[i][1], z = points[i][2], w = 1;
    for (let j = i - 1; j >= 0 && arc[i] - arc[j] < r; j--) {
      const k = 1 - (arc[i] - arc[j]) / r;
      x += points[j][0] * k; y += points[j][1] * k; z += points[j][2] * k; w += k;
    }
    for (let j = i + 1; j < n && arc[j] - arc[i] < r; j++) {
      const k = 1 - (arc[j] - arc[i]) / r;
      x += points[j][0] * k; y += points[j][1] * k; z += points[j][2] * k; w += k;
    }
    out[i] = [x / w, y / w, z / w];
  }
  return out;
}

/** Polygon outline of a stroke in world coordinates, at its drawn width (see strokeWidth). */
export function strokeOutline(el: StrokeEl): number[][] {
  return getStroke(smoothPoints(el.points), {
    size: strokeWidth(el),
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: el.simulatePressure,
  });
}

/** Smooth closed path through the outline's midpoints. */
export function outlineToPath(outline: number[][], create: PathFactory = defaultFactory): Path2D {
  const path = create();
  const n = outline.length;
  if (n === 0) return path;
  if (n < 3) {
    path.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < n; i++) path.lineTo(outline[i][0], outline[i][1]);
    path.closePath();
    return path;
  }
  const mid = (a: number[], b: number[]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const [sx, sy] = mid(outline[n - 1], outline[0]);
  path.moveTo(sx, sy);
  for (let i = 0; i < n; i++) {
    const p = outline[i];
    const [mx, my] = mid(p, outline[(i + 1) % n]);
    path.quadraticCurveTo(p[0], p[1], mx, my);
  }
  path.closePath();
  return path;
}
