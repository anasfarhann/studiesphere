import type { Scene } from "./scene";
import type { CanvasElement } from "./types";

/** Removed elements are in `before` only; added ones in `after` only; edited ones in both. */
export type Change = { before: CanvasElement[]; after: CanvasElement[] };

export const HISTORY_LIMIT = 200;

function withoutStamp(el: CanvasElement): Partial<CanvasElement> {
  const patch: Partial<CanvasElement> = { ...el };
  delete patch.updatedAt;
  return patch;
}

/** Undo/redo stack. Restores always carry a fresh updatedAt so last-write-wins accepts them. */
export class History {
  private undos: Change[] = [];
  private redos: Change[] = [];
  private listeners = new Set<() => void>();
  private lastStamp = 0;

  private stamp(prev: number): number {
    this.lastStamp = Math.max(Date.now(), prev + 1, this.lastStamp + 1);
    return this.lastStamp;
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }

  push(c: Change): void {
    this.undos.push(c);
    if (this.undos.length > HISTORY_LIMIT) this.undos.shift();
    this.redos = [];
    this.emit();
  }

  private apply(scene: Scene, from: CanvasElement[], to: CanvasElement[]): void {
    const fromIds = new Set(from.map((e) => e.id));
    const toIds = new Set(to.map((e) => e.id));
    for (const el of from) if (!toIds.has(el.id)) scene.remove(el.id);
    for (const el of to) {
      if (fromIds.has(el.id) && scene.get(el.id)) scene.update(el.id, withoutStamp(el));
      else scene.add({ ...el, updatedAt: this.stamp(el.updatedAt) });
    }
  }

  undo(scene: Scene): void {
    const c = this.undos.pop();
    if (!c) return;
    this.apply(scene, c.after, c.before);
    this.redos.push(c);
    this.emit();
  }

  redo(scene: Scene): void {
    const c = this.redos.pop();
    if (!c) return;
    this.apply(scene, c.before, c.after);
    this.undos.push(c);
    this.emit();
  }

  canUndo(): boolean {
    return this.undos.length > 0;
  }

  canRedo(): boolean {
    return this.redos.length > 0;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}
