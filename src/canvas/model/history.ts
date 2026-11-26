import type { Scene } from "./scene";
import type { CanvasElement } from "./types";

/** Removed elements are in `before` only; added ones in `after` only; edited ones in both. */
export type Change = { before: CanvasElement[]; after: CanvasElement[] };

export const HISTORY_LIMIT = 200;

/**
 * Patch that makes `live` become `target`: target's fields, plus an explicit undefined for every field
 * the live element has and the target lacks (Scene.update deletes those). Identity and stamp are left out.
 */
export function patchToward(live: CanvasElement, target: CanvasElement): Partial<CanvasElement> {
  const patch: Record<string, unknown> = { ...target };
  delete patch.updatedAt;
  for (const k of Object.keys(live)) if (k !== "id" && k !== "type" && k !== "updatedAt" && !(k in target)) patch[k] = undefined;
  return patch as Partial<CanvasElement>;
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

  /** Drops `c` if it is the newest undo step (it is not applied or undone). Returns whether it was dropped. */
  discard(c: Change): boolean {
    if (this.undos[this.undos.length - 1] !== c) return false;
    this.undos.pop();
    this.emit();
    return true;
  }

  private apply(scene: Scene, from: CanvasElement[], to: CanvasElement[]): void {
    const fromIds = new Set(from.map((e) => e.id));
    const toIds = new Set(to.map((e) => e.id));
    scene.batch(() => {
      for (const el of from) if (!toIds.has(el.id)) scene.remove(el.id);
      for (const el of to) {
        const live = scene.get(el.id);
        if (fromIds.has(el.id) && live) scene.update(el.id, patchToward(live, el));
        else scene.add({ ...el, updatedAt: this.stamp(el.updatedAt) });
      }
    });
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
