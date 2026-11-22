import RBush from "rbush";
import { boundsOf } from "./bounds";
import type { CanvasElement, Rect } from "./types";

type Entry = Rect & { el: CanvasElement };

export class Scene {
  private els = new Map<string, CanvasElement>();
  private entries = new Map<string, Entry>();
  private tree = new RBush<Entry>();
  private dirty = new Set<string>();
  private deleted = new Set<string>();
  private listeners = new Set<() => void>();

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
    for (const fn of [...this.listeners]) fn();
  }

  add(el: CanvasElement): void {
    this.index(el);
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
      updatedAt: patch.updatedAt ?? Date.now(),
    } as CanvasElement;
    this.index(next);
    this.dirty.add(id);
    this.emit();
  }

  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.tree.remove(entry);
    this.entries.delete(id);
    this.els.delete(id);
    this.dirty.delete(id);
    this.deleted.add(id);
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

  takeDirty(): { upserts: CanvasElement[]; deletes: string[] } {
    const upserts: CanvasElement[] = [];
    for (const id of this.dirty) {
      const el = this.els.get(id);
      if (el) upserts.push(el);
    }
    const deletes = [...this.deleted];
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
