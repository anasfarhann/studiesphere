export type ShapeKind = "line" | "rectangle" | "square" | "circle" | "triangle";
export type RecognizedShape = { kind: ShapeKind; points: [number, number][] };

type P = [number, number];

/** Output outlines have points at most this far apart (world units), so perfect-freehand keeps edges crisp. */
const MAX_SPACING = 4;
/** Below this bbox diagonal (world units) nothing is recognised. */
const MIN_DIAGONAL = 8;
/** Line: RMS distance from the fitted line, relative to its length. */
const LINE_RMS = 0.035;
/** Closed shapes: the end must be within this fraction of the bbox diagonal from the start. */
const CLOSE_GAP = 0.2;
/** Closed outlines are resampled to this many points for corner detection. */
const RING_N = 64;
/** Corner detection compares chords this many samples either side. */
const CORNER_W = 4;
/** A turn sharper than this (degrees) is a corner. */
const CORNER_DEG = 50;
/** Polygon / circle fit: RMS distance from the fitted outline, relative to the bbox diagonal. */
const FIT_RMS = 0.045;
/** Circle: radial standard deviation relative to the mean radius. */
const CIRCLE_CV = 0.1;
/** Circle: minor/major axis ratio at or above which an ellipse counts as a circle. */
const CIRCLE_AXIS_RATIO = 0.8;
/** Rectangle corners must be within this many degrees of a right angle. */
const RIGHT_ANGLE_TOL = 15;
/** Square: sides within 10% of each other. */
const SQUARE_ASPECT = 0.1;
/** Rectangles within this many degrees of the page axes are made exactly axis-aligned. */
const AXIS_SNAP_DEG = 5;

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Fits a clean line, rectangle, square, circle or triangle to a hand-drawn stroke, or returns null when
 * no fit is confident. The result is a densified outline in world coordinates, closed for closed shapes.
 */
export function recognizeShape(points: [number, number][]): RecognizedShape | null {
  if (points.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY);
  if (!(diag >= MIN_DIAGONAL)) return null;

  const line = fitLine(points);
  if (line) return line;

  const start = points[0];
  let end = points.length - 1;
  if (dist(points[end], start) > CLOSE_GAP * diag) return null;
  // Overshoot past the start: cut the stroke where it came closest to the start.
  for (let i = Math.floor(points.length * 0.7); i < points.length; i++) {
    if (dist(points[i], start) < dist(points[end], start)) end = i;
  }
  const ring = resampleClosed(points.slice(0, end + 1), RING_N);
  if (!ring) return null;
  const corners = findCorners(ring);
  if (corners.length === 3) return fitTriangle(ring, corners, diag);
  if (corners.length === 4) return fitRectangle(ring, corners, diag);
  if (corners.length === 0) return fitCircle(ring, diag);
  return null;
}

/** Principal axis of a point set: centroid, unit direction, and the variances along/across it. */
function pca(pts: P[]): { cx: number; cy: number; ux: number; uy: number; major: number; minor: number } {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of pts) {
    cx += x;
    cy += y;
  }
  cx /= pts.length;
  cy /= pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    const dx = x - cx;
    const dy = y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  sxx /= pts.length;
  syy /= pts.length;
  sxy /= pts.length;
  const theta = Math.atan2(2 * sxy, sxx - syy) / 2;
  const tr = (sxx + syy) / 2;
  const det = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
  return { cx, cy, ux: Math.cos(theta), uy: Math.sin(theta), major: tr + det, minor: Math.max(0, tr - det) };
}

function fitLine(pts: P[]): RecognizedShape | null {
  const { cx, cy, ux, uy } = pca(pts);
  let lo = Infinity;
  let hi = -Infinity;
  let sq = 0;
  for (const [x, y] of pts) {
    const t = (x - cx) * ux + (y - cy) * uy;
    const d = -(x - cx) * uy + (y - cy) * ux;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
    sq += d * d;
  }
  const len = hi - lo;
  if (!(len > 0) || Math.sqrt(sq / pts.length) / len > LINE_RMS) return null;
  const proj = (p: P): P => {
    const t = (p[0] - cx) * ux + (p[1] - cy) * uy;
    return [cx + t * ux, cy + t * uy];
  };
  const a = proj(pts[0]);
  const b = proj(pts[pts.length - 1]);
  // The stroke must run end to end, not double back past its ends.
  if (dist(a, b) < 0.9 * len) return null;
  return { kind: "line", points: densify([a, b]) };
}

/** `n` points evenly spaced around the closed loop through `pts` (closing segment included). */
function resampleClosed(pts: P[], n: number): P[] | null {
  const loop = [...pts, pts[0]];
  let total = 0;
  for (let i = 1; i < loop.length; i++) total += dist(loop[i - 1], loop[i]);
  if (!(total > 0)) return null;
  const step = total / n;
  const out: P[] = [];
  let seg = 1;
  let segStart = 0;
  for (let k = 0; k < n; k++) {
    const target = k * step;
    while (seg < loop.length - 1 && segStart + dist(loop[seg - 1], loop[seg]) < target) {
      segStart += dist(loop[seg - 1], loop[seg]);
      seg++;
    }
    const a = loop[seg - 1];
    const b = loop[seg];
    const l = dist(a, b);
    const t = l > 0 ? Math.min(1, (target - segStart) / l) : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Indices of sharp turns around a closed ring (local maxima above CORNER_DEG), in ring order. */
function findCorners(ring: P[]): number[] {
  const n = ring.length;
  const turn = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const a = ring[(i - CORNER_W + n) % n];
    const b = ring[i];
    const c = ring[(i + CORNER_W) % n];
    const v1x = b[0] - a[0];
    const v1y = b[1] - a[1];
    const v2x = c[0] - b[0];
    const v2y = c[1] - b[1];
    turn[i] = Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y)) * (180 / Math.PI);
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (turn[i] < CORNER_DEG) continue;
    let peak = true;
    for (let k = 1; k <= CORNER_W && peak; k++) {
      // Ties go to the earlier index so a flat-topped peak yields one corner.
      if (turn[(i + k) % n] > turn[i] || turn[(i - k + n) % n] >= turn[i]) peak = false;
    }
    if (peak) out.push(i);
  }
  return out;
}

/** Distance from p to segment ab. */
function segDist(p: P, a: P, b: P): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** RMS distance from the ring to a closed polygon, relative to `diag`. */
function polygonFit(ring: P[], poly: P[], diag: number): number {
  let sq = 0;
  for (const p of ring) {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) best = Math.min(best, segDist(p, poly[i], poly[(i + 1) % poly.length]));
    sq += best * best;
  }
  return Math.sqrt(sq / ring.length) / diag;
}

function fitTriangle(ring: P[], corners: number[], diag: number): RecognizedShape | null {
  const poly = corners.map((i) => ring[i]);
  if (polygonFit(ring, poly, diag) > FIT_RMS) return null;
  return { kind: "triangle", points: densify([...poly, poly[0]]) };
}

function fitRectangle(ring: P[], corners: number[], diag: number): RecognizedShape | null {
  const c = corners.map((i) => ring[i]);
  for (let i = 0; i < 4; i++) {
    const a = c[(i + 3) % 4];
    const b = c[i];
    const d = c[(i + 1) % 4];
    const ang = Math.abs(Math.atan2((a[0] - b[0]) * (d[1] - b[1]) - (a[1] - b[1]) * (d[0] - b[0]), (a[0] - b[0]) * (d[0] - b[0]) + (a[1] - b[1]) * (d[1] - b[1])));
    if (Math.abs((ang * 180) / Math.PI - 90) > RIGHT_ANGLE_TOL) return null;
  }
  // Dominant orientation: length-weighted mean of the edge angles modulo 90 degrees.
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < 4; i++) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    const l = dist(a, b);
    const th = Math.atan2(b[1] - a[1], b[0] - a[0]) * 4;
    sx += l * Math.cos(th);
    sy += l * Math.sin(th);
  }
  let theta = Math.atan2(sy, sx) / 4;
  if (Math.abs(theta) < (AXIS_SNAP_DEG * Math.PI) / 180) theta = 0;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // Into the rectangle's frame: the two smallest u are the left side, the two largest the right; same for v.
  const us = c.map(([x, y]) => x * cos + y * sin).sort((p, q) => p - q);
  const vs = c.map(([x, y]) => -x * sin + y * cos).sort((p, q) => p - q);
  let u0 = (us[0] + us[1]) / 2;
  let u1 = (us[2] + us[3]) / 2;
  let v0 = (vs[0] + vs[1]) / 2;
  let v1 = (vs[2] + vs[3]) / 2;
  let w = u1 - u0;
  let h = v1 - v0;
  if (!(w > 0) || !(h > 0)) return null;
  let kind: ShapeKind = "rectangle";
  if (Math.abs(w - h) / Math.max(w, h) <= SQUARE_ASPECT) {
    kind = "square";
    const s = (w + h) / 2;
    const mu = (u0 + u1) / 2;
    const mv = (v0 + v1) / 2;
    u0 = mu - s / 2;
    u1 = mu + s / 2;
    v0 = mv - s / 2;
    v1 = mv + s / 2;
    w = h = s;
  }
  const back = (u: number, v: number): P => [u * cos - v * sin, u * sin + v * cos];
  // Start at the corner nearest the stroke's start, keeping the drawn direction.
  let poly: P[] = [back(u0, v0), back(u1, v0), back(u1, v1), back(u0, v1)];
  if (polygonFit(ring, poly, diag) > FIT_RMS) return null;
  const s0 = ring[0];
  let first = 0;
  for (let i = 1; i < 4; i++) if (dist(poly[i], s0) < dist(poly[first], s0)) first = i;
  poly = [...poly.slice(first), ...poly.slice(0, first)];
  if (signedArea(ring) * signedArea(poly) < 0) poly = [poly[0], ...poly.slice(1).reverse()];
  return { kind, points: densify([...poly, poly[0]]) };
}

function signedArea(pts: P[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function fitCircle(ring: P[], diag: number): RecognizedShape | null {
  const { cx, cy, major, minor } = pca(ring);
  if (!(major > 0) || Math.sqrt(minor / major) < CIRCLE_AXIS_RATIO) return null;
  let sum = 0;
  for (const p of ring) sum += Math.hypot(p[0] - cx, p[1] - cy);
  const r = sum / ring.length;
  let sq = 0;
  for (const p of ring) sq += (Math.hypot(p[0] - cx, p[1] - cy) - r) ** 2;
  const sd = Math.sqrt(sq / ring.length);
  if (sd / r > CIRCLE_CV || sd / diag > FIT_RMS) return null;
  // Start where the stroke started and go round the way it was drawn.
  const a0 = Math.atan2(ring[0][1] - cy, ring[0][0] - cx);
  const dir = signedArea(ring) >= 0 ? 1 : -1;
  const n = Math.max(16, Math.ceil((2 * Math.PI * r) / MAX_SPACING));
  const points: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (dir * 2 * Math.PI * i) / n;
    points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  points.push(points[0]);
  return { kind: "circle", points };
}

/** The polyline with extra points so that no gap exceeds MAX_SPACING; vertices are kept exactly. */
function densify(vertices: P[]): P[] {
  const out: P[] = [vertices[0]];
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1];
    const b = vertices[i];
    const n = Math.max(1, Math.ceil(dist(a, b) / MAX_SPACING));
    for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    out.push(i === vertices.length - 1 && dist(b, vertices[0]) === 0 ? vertices[0] : b);
  }
  return out;
}
