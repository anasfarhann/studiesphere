import { pointInPolygon } from "../geometry/point-in-polygon";
import { boundsOf } from "../model/bounds";
import type { Change } from "../model/history";
import type { History } from "../model/history";
import type { Scene } from "../model/scene";
import type { Selection } from "../selection";
import { ImageResize } from "./image-resize";
import type { PointerInfo, Tool, WorldPoint } from "./tool";

/** A stroke is selected when at least this share of its points lies inside the lasso. */
const STROKE_INSIDE_RATIO = 0.6;

/** Ids of the elements a closed lasso (even-odd) selects. */
export function elementsInLasso(scene: Scene, polygon: [number, number][]): string[] {
  if (polygon.length < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of polygon) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const ids: string[] = [];
  for (const el of scene.getVisible({ minX, minY, maxX, maxY })) {
    if (el.type === "stroke") {
      if (el.points.length === 0) continue;
      let inside = 0;
      for (const [x, y] of el.points) if (pointInPolygon(x, y, polygon)) inside++;
      if (inside / el.points.length >= STROKE_INSIDE_RATIO) ids.push(el.id);
    } else {
      const b = boundsOf(el);
      if (pointInPolygon((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, polygon)) ids.push(el.id);
    }
  }
  return ids;
}

export interface LassoToolContext {
  scene: Scene;
  history: History;
  selection: Selection;
  /** Shows (or clears, with null) the lasso path being drawn. */
  setLasso: (points: [number, number][] | null) => void;
  /** Camera zoom, for the corner handle's screen-sized touch target. */
  zoom: () => number;
}

/** Draw a loop to select; drag inside the selection box to move it; tap elsewhere to deselect. */
export class LassoTool implements Tool {
  readonly id = "lasso" as const;
  private mode: "idle" | "lasso" | "move" | "resize" = "idle";
  private resize: ImageResize;
  private path: [number, number][] = [];
  private last: [number, number] = [0, 0];
  private moveBefore: Change["before"] | null = null;
  private moveAfter: Change["after"] = [];

  constructor(private ctx: LassoToolContext) {
    this.resize = new ImageResize(ctx);
  }

  down(p: WorldPoint, e: PointerInfo): void {
    void e;
    this.finish();
    if (this.resize.begin(p[0], p[1])) {
      this.mode = "resize";
      return;
    }
    const b = this.ctx.selection.bounds();
    if (b && p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY) {
      this.mode = "move";
      this.last = [p[0], p[1]];
      this.moveBefore = null;
      return;
    }
    this.ctx.selection.clear();
    this.mode = "lasso";
    this.path = [[p[0], p[1]]];
    this.ctx.setLasso([...this.path]);
  }

  move(pts: WorldPoint[], e: PointerInfo): void {
    void e;
    if (this.mode === "lasso") {
      for (const p of pts) this.path.push([p[0], p[1]]);
      this.ctx.setLasso([...this.path]);
    } else if (this.mode === "resize") {
      const p = pts[pts.length - 1];
      if (p) this.resize.move(p[0], p[1]);
    } else if (this.mode === "move") {
      const p = pts[pts.length - 1];
      if (!p) return;
      const dx = p[0] - this.last[0];
      const dy = p[1] - this.last[1];
      if (dx === 0 && dy === 0) return;
      this.last = [p[0], p[1]];
      const c = this.ctx.selection.moveBy(dx, dy);
      // One drag is one undo step: keep the very first `before`, the latest `after`.
      this.moveBefore ??= c.before;
      this.moveAfter = c.after;
    }
  }

  up(): void {
    this.finish();
  }

  /** Keeps whatever was moved so far (undoable). */
  cancel(): void {
    this.finish();
  }

  private finish(): void {
    const mode = this.mode;
    this.mode = "idle";
    if (mode === "lasso") {
      const path = this.path;
      this.path = [];
      this.ctx.setLasso(null);
      this.ctx.selection.set(elementsInLasso(this.ctx.scene, path));
    } else if (mode === "resize") {
      this.resize.end();
    } else if (mode === "move" && this.moveBefore) {
      this.ctx.history.push({ before: this.moveBefore, after: this.moveAfter });
      this.moveBefore = null;
      this.moveAfter = [];
    }
  }
}
