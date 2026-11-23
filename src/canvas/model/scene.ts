import RBush from "rbush";
import { boundsOf } from "./bounds";
import type { CanvasElement, Rect } from "./types";

type Entry = Rect & { el: CanvasElement };

export class Scene {
  private els = new Map<string, CanvasElement>();
  private entries = new Map<string, Entry>();
  private tree = new RBush<Entry>();
  private dirty = new Set<string>();
  private deleted = new Map<string, number>();
  /** Last updatedAt handed out per id, removals included: one clock per author. */
  private lastStamp = new Map<string, number>();
  private listeners = new Set<() => void>();
  /** Open batch() calls; while > 0 mutations only mark `pendingEmit`. */
  private batchDepth = 0;
  private pendingEmit = false;

  constructor(elements: CanvasElement[] = []) {
    for (const el of elements) this.index(el);
  }

  private index(el: CanvasElement): void {
    const old = this.entries.get(el.id);
    if (old) this.tree.remove(old);
    const entry: Entry = { ...boundsOf(el), el };
    this.els.set(el.id, el);
    this.entries.set(el.id, entry);
    this.tree.insert(entry);
  }

  private emit(): void {
    if (this.batchDepth > 0) {
      this.pendingEmit = true;
      return;
    }
    for (const fn of [...this.listeners]) fn();
  }

  /**
   * Runs `fn` with change notifications held back, then notifies listeners once (if anything
   * changed). Nested batches notify when the outermost one ends. Dirty tracking is unaffected.
   */
  batch<T>(fn: () => T): T {
    this.batchDepth++;
    try {
      return fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.pendingEmit) {
        this.pendingEmit = false;
        this.emit();
      }
    }
  }

  add(el: CanvasElement): void {
    let next = el;
    const last = this.lastStamp.get(el.id);
    // Re-adding a removed element: it must be newer than its own tombstone.
    if (last !== undefined && !this.els.has(el.id)) {
      next = { ...el, updatedAt: Math.max(el.updatedAt, Date.now(), last + 1) };
    }
    this.lastStamp.set(el.id, Math.max(next.updatedAt, last ?? 0));
    this.index(next);
    this.dirty.add(el.id);
    this.deleted.delete(el.id);
    this.emit();
  }

  update(id: string, patch: Partial<CanvasElement>): void {
    const cur = this.els.get(id);
    if (!cur) return;
    const next = {
      ...cur,
      ...patch,
      id: cur.id,
      type: cur.type,
      updatedAt: patch.updatedAt ?? Math.max(Date.now(), cur.updatedAt + 1),
    } as CanvasElement;
    this.lastStamp.set(id, Math.max(next.updatedAt, this.lastStamp.get(id) ?? 0));
    this.index(next);
    this.dirty.add(id);
    this.emit();
  }

  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    const stamp = Math.max(Date.now(), (this.lastStamp.get(id) ?? 0) + 1, entry.el.updatedAt + 1);
    this.lastStamp.set(id, stamp);
    this.tree.remove(entry);
    this.entries.delete(id);
    this.els.delete(id);
    this.dirty.delete(id);
    this.deleted.set(id, stamp);
    this.emit();
  }

  get(id: string): CanvasElement | undefined {
    return this.els.get(id);
  }

  all(): CanvasElement[] {
    return [...this.els.values()].sort((a, b) => a.z - b.z);
  }

  getVisible(view: Rect): CanvasElement[] {
    return this.tree
      .search(view)
      .map((e) => e.el)
      .sort((a, b) => a.z - b.z);
  }

  nextZ(): number {
    let max = -1;
    for (const el of this.els.values()) if (el.z > max) max = el.z;
    return max + 1;
  }

  takeDirty(): { upserts: CanvasElement[]; deletes: { id: string; updatedAt: number }[] } {
    const upserts: CanvasElement[] = [];
    for (const id of this.dirty) {
      const el = this.els.get(id);
      if (el) upserts.push(el);
    }
    const deletes = [...this.deleted].map(([id, updatedAt]) => ({ id, updatedAt }));
    this.dirty.clear();
    this.deleted.clear();
    return { upserts, deletes };
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}
