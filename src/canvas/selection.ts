import { boundsOf } from "./model/bounds";
import type { Change } from "./model/history";
import type { Scene } from "./model/scene";
import type { CanvasElement, Rect } from "./model/types";

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
