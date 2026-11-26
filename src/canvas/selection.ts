import { distToSegment } from "./geometry/polygon-rect";
import { boundsOf } from "./model/bounds";
import type { Change } from "./model/history";
import type { Scene } from "./model/scene";
import { strokeWidth } from "./model/stroke-style";
import type { CanvasElement, Rect, StrokeEl } from "./model/types";

function strokeHit(el: StrokeEl, x: number, y: number, reach: number): boolean {
  const pts = el.points;
  if (pts.length === 0) return false;
  if (pts.length === 1) return Math.hypot(x - pts[0][0], y - pts[0][1]) <= reach;
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(x, y, [pts[i - 1][0], pts[i - 1][1]], [pts[i][0], pts[i][1]]) <= reach) return true;
  }
  return false;
}

/**
 * Id of the topmost element whose hit area contains (x, y), or null. Strokes are hit within
 * max(drawn width / 2, `minReach`) of their path (`minReach` in world units); other elements within their bounds.
 */
export function elementAt(scene: Scene, x: number, y: number, minReach: number): string | null {
  // Stroke bounds already include half their width, so padding by minReach finds every candidate.
  const near = scene.getVisible({ minX: x - minReach, minY: y - minReach, maxX: x + minReach, maxY: y + minReach });
  for (let i = near.length - 1; i >= 0; i--) {
    const el = near[i];
    if (el.type === "stroke") {
      if (strokeHit(el, x, y, Math.max(strokeWidth(el) / 2, minReach))) return el.id;
    } else {
      const b = boundsOf(el);
      if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return el.id;
    }
  }
  return null;
}

/** The set of selected element ids, with the operations that act on it. */
export class Selection {
  private _ids: string[] = [];
  private listeners = new Set<() => void>();

  constructor(private scene: Scene) {}

  get ids(): string[] {
    return this._ids;
  }

  set(ids: string[]): void {
    this._ids = ids.filter((id) => this.scene.get(id));
    this.emit();
  }

  clear(): void {
    if (this._ids.length === 0) return;
    this._ids = [];
    this.emit();
  }

  /** Forgets ids whose elements are gone from the scene. */
  prune(): void {
    const kept = this._ids.filter((id) => this.scene.get(id));
    if (kept.length === this._ids.length) return;
    this._ids = kept;
    this.emit();
  }

  /** Union of the selected elements' bounds. */
  bounds(): Rect | null {
    let r: Rect | null = null;
    for (const id of this._ids) {
      const el = this.scene.get(id);
      if (!el) continue;
      const b = boundsOf(el);
      r = r
        ? { minX: Math.min(r.minX, b.minX), minY: Math.min(r.minY, b.minY), maxX: Math.max(r.maxX, b.maxX), maxY: Math.max(r.maxY, b.maxY) }
        : b;
    }
    return r;
  }

  /** Shifts the selection in the scene and returns the change (not pushed to history). */
  moveBy(dx: number, dy: number): Change {
    const before: CanvasElement[] = [];
    const after: CanvasElement[] = [];
    // One scene notification for the whole move, not one per element (O(k) instead of O(k²)).
    this.scene.batch(() => {
      for (const id of this._ids) {
        const el = this.scene.get(id);
        if (!el) continue;
        before.push(el);
        if (el.type === "stroke") {
          this.scene.update(id, { points: el.points.map(([x, y, p]) => [x + dx, y + dy, p]) });
        } else {
          this.scene.update(id, { x: el.x + dx, y: el.y + dy });
        }
        const next = this.scene.get(id);
        if (next) after.push(next);
      }
    });
    this.emit();
    return { before, after };
  }

  /** The selected elements, by z. */
  elements(): CanvasElement[] {
    const out: CanvasElement[] = [];
    for (const id of this._ids) {
      const el = this.scene.get(id);
      if (el) out.push(el);
    }
    return out.sort((a, b) => a.z - b.z);
  }

  /** Sets the colour of every selected stroke and returns the change (not pushed to history). */
  recolor(color: string): Change {
    const before: CanvasElement[] = [];
    const after: CanvasElement[] = [];
    this.scene.batch(() => {
      for (const id of this._ids) {
        const el = this.scene.get(id);
        if (!el || el.type !== "stroke" || el.color === color) continue;
        before.push(el);
        this.scene.update(id, { color });
        const next = this.scene.get(id);
        if (next) after.push(next);
      }
    });
    if (before.length > 0) this.emit();
    return { before, after };
  }

  /** Removes the selection from the scene and returns the change (not pushed to history). */
  deleteAll(): Change {
    const before: CanvasElement[] = [];
    const ids = this._ids;
    this._ids = [];
    this.scene.batch(() => {
      for (const id of ids) {
        const el = this.scene.get(id);
        if (!el) continue;
        before.push(el);
        this.scene.remove(id);
      }
    });
    this.emit();
    return { before, after: [] };
  }

  /** Tells listeners the selected elements changed in place (a scale drag), so overlays follow. */
  notify(): void {
    this.emit();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }
}
