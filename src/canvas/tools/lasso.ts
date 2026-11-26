import { pointInPolygon } from "../geometry/point-in-polygon";
import { polygonIntersectsRect } from "../geometry/polygon-rect";
import { boundsOf } from "../model/bounds";
import type { Change } from "../model/history";
import type { History } from "../model/history";
import type { Scene } from "../model/scene";
import { elementAt, type Selection } from "../selection";
import { ImageResize } from "./image-resize";
import type { PointerInfo, Tool, WorldPoint } from "./tool";

/** A stroke is selected when at least this share of its points lies inside the lasso. */
const STROKE_INSIDE_RATIO = 0.6;
/** A press that moves less than this (screen px) is a tap. */
export const TAP_SLOP_PX = 6;
/** Strokes are hit by a tap within at least this many screen px of their path. */
export const STROKE_TAP_REACH_PX = 8;

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
    } else if (polygonIntersectsRect(polygon, boundsOf(el))) {
      ids.push(el.id);
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
  /** Camera zoom, for the corner handle's screen-sized touch target and the tap slop. */
  zoom: () => number;
  /** A tap on empty space, or a lasso that selected nothing (at its bounds centre): where a paste could go. */
  onEmpty?: (at: [number, number]) => void;
}

/**
 * Draw a loop to select; tap to select the topmost element under the pointer (or clear on empty space);
 * drag inside the selection box to move it.
 */
export class LassoTool implements Tool {
  readonly id = "lasso" as const;
  private mode: "idle" | "lasso" | "move" | "resize" = "idle";
  private resize: ImageResize;
  private path: [number, number][] = [];
  private last: [number, number] = [0, 0];
  private start: [number, number] = [0, 0];
  /** Still within the tap slop of the press. */
  private still = true;
  private moveBefore: Change["before"] | null = null;
  private moveAfter: Change["after"] = [];

  constructor(private ctx: LassoToolContext) {
    this.resize = new ImageResize(ctx);
  }

  down(p: WorldPoint, e: PointerInfo): void {
    void e;
    this.finish(false);
    if (this.resize.begin(p[0], p[1])) {
      this.mode = "resize";
      return;
    }
    this.start = [p[0], p[1]];
    this.still = true;
    const b = this.ctx.selection.bounds();
    if (b && p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY) {
      this.mode = "move";
      this.last = [p[0], p[1]];
      this.moveBefore = null;
      return;
    }
    this.mode = "lasso";
    this.path = [[p[0], p[1]]];
    this.ctx.setLasso([...this.path]);
  }

  move(pts: WorldPoint[], e: PointerInfo): void {
    void e;
    if (this.still) {
      const slop = TAP_SLOP_PX / this.ctx.zoom();
      for (const p of pts) {
        if (Math.hypot(p[0] - this.start[0], p[1] - this.start[1]) >= slop) {
          this.still = false;
          break;
        }
      }
    }
    if (this.mode === "lasso") {
      if (!this.still) this.ctx.selection.clear();
      for (const p of pts) this.path.push([p[0], p[1]]);
      this.ctx.setLasso([...this.path]);
    } else if (this.mode === "resize") {
      const p = pts[pts.length - 1];
      if (p) this.resize.move(p[0], p[1]);
    } else if (this.mode === "move") {
      const p = pts[pts.length - 1];
      // Under the tap slop nothing moves yet (it may be a tap on another element).
      if (!p || this.still) return;
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
    if ((this.mode === "lasso" || this.mode === "move") && this.still) {
      this.mode = "idle";
      this.path = [];
      this.ctx.setLasso(null);
      this.tap(this.start);
      return;
    }
    this.finish();
  }

  /** Keeps whatever was moved so far (undoable). A press still within the tap slop does nothing. */
  cancel(): void {
    if ((this.mode === "lasso" || this.mode === "move") && this.still) {
      this.mode = "idle";
      this.path = [];
      this.ctx.setLasso(null);
      return;
    }
    // Interrupted (a second finger, a tool switch): no paste offer.
    this.finish(false);
  }

  private tap([x, y]: [number, number]): void {
    const id = elementAt(this.ctx.scene, x, y, STROKE_TAP_REACH_PX / this.ctx.zoom());
    if (id) {
      this.ctx.selection.set([id]);
      return;
    }
    this.ctx.selection.clear();
    this.ctx.onEmpty?.([x, y]);
  }

  private finish(offerPaste = true): void {
    const mode = this.mode;
    this.mode = "idle";
    if (mode === "lasso") {
      const path = this.path;
      this.path = [];
      this.ctx.setLasso(null);
      const ids = elementsInLasso(this.ctx.scene, path);
      this.ctx.selection.set(ids);
      if (offerPaste && ids.length === 0 && path.length > 0) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const [px, py] of path) {
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
        this.ctx.onEmpty?.([(minX + maxX) / 2, (minY + maxY) / 2]);
      }
    } else if (mode === "resize") {
      this.resize.end();
    } else if (mode === "move" && this.moveBefore) {
      this.ctx.history.push({ before: this.moveBefore, after: this.moveAfter });
      this.moveBefore = null;
      this.moveAfter = [];
    }
  }
}
