import type { Rect } from "../model/types";
import { pointInPolygon } from "./point-in-polygon";

type Pt = readonly [number, number];

/** Orientation of c relative to a→b: >0 left, <0 right, 0 collinear. */
function cross(a: Pt, b: Pt, c: Pt): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Pt, b: Pt, c: Pt): boolean {
  return Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
}

/** Whether segments p1–p2 and q1–q2 touch or cross. */
export function segmentsIntersect(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (
    (d1 === 0 && onSegment(q1, q2, p1)) ||
    (d2 === 0 && onSegment(q1, q2, p2)) ||
    (d3 === 0 && onSegment(p1, p2, q1)) ||
    (d4 === 0 && onSegment(p1, p2, q2))
  );
}

/**
 * Whether a closed polygon overlaps a rectangle at all: a polygon vertex inside the rectangle, a
 * rectangle corner inside the polygon (even-odd), or a polygon edge crossing a rectangle edge.
 */
export function polygonIntersectsRect(poly: ReadonlyArray<Pt>, r: Rect): boolean {
  if (poly.length === 0) return false;
  for (const [x, y] of poly) if (x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY) return true;
  const corners: Pt[] = [[r.minX, r.minY], [r.maxX, r.minY], [r.maxX, r.maxY], [r.minX, r.maxY]];
  for (const [x, y] of corners) if (pointInPolygon(x, y, poly)) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    for (let k = 0; k < 4; k++) {
      if (segmentsIntersect(poly[j], poly[i], corners[k], corners[(k + 1) % 4])) return true;
    }
  }
  return false;
}

/** Distance from (x, y) to the segment a–b. */
export function distToSegment(x: number, y: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2));
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}
