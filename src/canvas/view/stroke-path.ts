import { getStroke } from "perfect-freehand";
import { strokeWidth } from "../model/stroke-style";
import type { StrokeEl } from "../model/types";

export type PathFactory = () => Path2D;

const defaultFactory: PathFactory = () => new Path2D();

/** Polygon outline of a stroke in world coordinates, at its drawn width (see strokeWidth). */
export function strokeOutline(el: StrokeEl): number[][] {
  return getStroke(el.points, {
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
