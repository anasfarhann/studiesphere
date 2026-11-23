import type { Point, StrokeEl } from "../model/types";

const lerp = (a: Point, b: Point, t: number): Point => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Parameter interval (clipped to [0,1]) where segment a→b is within r of c, or null. */
function insideInterval(a: Point, b: Point, c: [number, number], r: number): [number, number] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const fx = a[0] - c[0];
  const fy = a[1] - c[1];
  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;
  if (A === 0) return C < 0 ? [0, 1] : null;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return null;
  const root = Math.sqrt(disc);
  const t0 = Math.max(0, (-B - root) / (2 * A));
  const t1 = Math.min(1, (-B + root) / (2 * A));
  return t0 < t1 ? [t0, t1] : null;
}

/**
 * Removes the part of a stroke inside the circle (center, radius) by splitting it.
 * Returns [] when nothing is left, [el] (same reference) when untouched, else new pieces.
 */
export function eraseFromStroke(
  el: StrokeEl,
  center: [number, number],
  radius: number,
  newId: () => string,
): StrokeEl[] {
  const pts = el.points;
  if (pts.length === 0) return [];
  // Cut a hair beyond the radius so surviving points are never inside it despite rounding.
  const r = radius + 1e-6;
  const inside = (p: Point) => Math.hypot(p[0] - center[0], p[1] - center[1]) < radius;

  if (pts.length === 1) return inside(pts[0]) ? [] : [el];

  const pieces: Point[][] = [];
  let cur: Point[] = [];
  let cut = false;
  if (!inside(pts[0])) cur.push(pts[0]);
  else cut = true;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const iv = insideInterval(a, b, center, r);
    if (!iv) {
      if (!inside(b)) cur.push(b);
      continue;
    }
    cut = true;
    if (iv[0] > 0) cur.push(lerp(a, b, iv[0]));
    if (cur.length > 0) pieces.push(cur);
    cur = [];
    if (iv[1] < 1) {
      cur.push(lerp(a, b, iv[1]));
      cur.push(b);
    }
  }
  if (cur.length > 0) pieces.push(cur);

  if (!cut) return [el];
  return pieces.filter((p) => p.length >= 2).map((points) => ({ ...el, id: newId(), points }));
}
