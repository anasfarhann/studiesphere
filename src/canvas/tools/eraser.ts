import { eraseFromStroke, strokeTouchesCircle } from "../geometry/split-stroke";
import type { History } from "../model/history";
import type { Scene } from "../model/scene";
import type { CanvasElement, StrokeEl } from "../model/types";
import type { EraserMode } from "../settings/tool-settings";
import type { PointerInfo, Tool, WorldPoint } from "./tool";

export interface EraserToolContext {
  scene: Scene;
  history: History;
  /** Eraser radius in world units (changes with zoom). */
  radius: () => number;
  /** "pixel" splits strokes around the pointer, "stroke" removes whole strokes. Defaults to pixel. */
  mode?: () => EraserMode;
  newId?: () => string;
  now?: () => number;
}

/** Eraser for strokes only: splits them around the pointer or removes them whole. One drag is one undo step. */
export class EraserTool implements Tool {
  readonly id = "eraser" as const;
  private active = false;
  private last: [number, number] | null = null;
  /** Elements that existed before the drag and were erased (by id). */
  private before = new Map<string, CanvasElement>();
  /** Pieces created during the drag that are still present. */
  private after = new Map<string, CanvasElement>();
  private newId: () => string;
  private now: () => number;

  constructor(private ctx: EraserToolContext) {
    this.newId = ctx.newId ?? (() => crypto.randomUUID());
    this.now = ctx.now ?? (() => Date.now());
  }

  down(p: WorldPoint, e: PointerInfo): void {
    void e;
    this.active = true;
    this.before.clear();
    this.after.clear();
    this.last = [p[0], p[1]];
    this.eraseAt(p[0], p[1]);
  }

  move(pts: WorldPoint[], e: PointerInfo): void {
    void e;
    if (!this.active) return;
    for (const p of pts) {
      // Fast drags skip positions: sweep intermediate centres so nothing is jumped over.
      const last = this.last ?? [p[0], p[1]];
      const step = Math.max(this.ctx.radius() / 2, 1e-3);
      const dist = Math.hypot(p[0] - last[0], p[1] - last[1]);
      const n = Math.min(Math.ceil(dist / step), 200);
      for (let i = 1; i <= n; i++) {
        this.eraseAt(last[0] + ((p[0] - last[0]) * i) / n, last[1] + ((p[1] - last[1]) * i) / n);
      }
      this.last = [p[0], p[1]];
    }
  }

  up(): void {
    if (!this.active) return;
    this.active = false;
    this.last = null;
    if (this.before.size > 0 || this.after.size > 0) {
      this.ctx.history.push({ before: [...this.before.values()], after: [...this.after.values()] });
    }
    this.before.clear();
    this.after.clear();
  }

  /** Keeps what was already erased and makes it undoable. */
  cancel(): void {
    this.up();
  }

  private eraseAt(x: number, y: number): void {
    const r = this.ctx.radius();
    const { scene } = this.ctx;
    const hits = scene.getVisible({ minX: x - r, minY: y - r, maxX: x + r, maxY: y + r });
    scene.batch(() => this.eraseHits(hits, x, y, r));
  }

  private eraseHits(hits: CanvasElement[], x: number, y: number, r: number): void {
    const { scene } = this.ctx;
    const whole = (this.ctx.mode?.() ?? "pixel") === "stroke";
    for (const el of hits) {
      if (el.type !== "stroke") continue;
      if (whole) {
        if (!strokeTouchesCircle(el, [x, y], r)) continue;
        scene.remove(el.id);
        if (this.after.has(el.id)) this.after.delete(el.id);
        else this.before.set(el.id, el);
        continue;
      }
      const pieces = eraseFromStroke(el, [x, y], r, this.newId);
      if (pieces.length === 1 && pieces[0] === el) continue;
      scene.remove(el.id);
      if (this.after.has(el.id)) this.after.delete(el.id);
      else this.before.set(el.id, el);
      for (const piece of pieces) {
        const next: StrokeEl = { ...piece, updatedAt: Math.max(this.now(), el.updatedAt + 1) };
        scene.add(next);
        this.after.set(next.id, next);
      }
    }
  }
}
