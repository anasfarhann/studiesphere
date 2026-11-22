import type { CanvasElement } from "../model/types";
import type { ElementStore, OfflineQueue, SaveBatch } from "./store";

type Row = { el: CanvasElement; deleted: boolean; updatedAt: number };

/** In-memory store with the same per-element merge rules as the save_elements SQL function. */
export class MemoryElementStore implements ElementStore {
  private pages = new Map<string, Map<string, Row>>();

  constructor(private now: () => number = () => Date.now()) {}

  private rows(pageId: string): Map<string, Row> {
    let m = this.pages.get(pageId);
    if (!m) {
      m = new Map();
      this.pages.set(pageId, m);
    }
    return m;
  }

  async load(pageId: string): Promise<CanvasElement[]> {
    const out: CanvasElement[] = [];
    for (const r of this.rows(pageId).values()) if (!r.deleted) out.push(structuredClone(r.el));
    return out;
  }

  async save(pageId: string, upserts: CanvasElement[], deletes: string[]): Promise<void> {
    const rows = this.rows(pageId);
    for (const el of upserts) {
      const cur = rows.get(el.id);
      if (cur && el.updatedAt < cur.updatedAt) continue;
      rows.set(el.id, { el: structuredClone(el), deleted: false, updatedAt: el.updatedAt });
    }
    for (const id of deletes) {
      const cur = rows.get(id);
      if (!cur) continue; // never saved: nothing to tombstone
      cur.deleted = true;
      cur.updatedAt = Math.max(this.now(), cur.updatedAt + 1);
    }
  }
}

/** Offline queue kept in memory (tests, dev canvas). Survives nothing. */
export class MemoryOfflineQueue implements OfflineQueue {
  private batches: SaveBatch[] = [];

  constructor(readonly pageId: string) {}

  async push(batch: SaveBatch): Promise<void> {
    this.batches = [...this.batches.filter((b) => b.queuedAt !== batch.queuedAt), structuredClone(batch)];
  }

  async drain(): Promise<SaveBatch[]> {
    return structuredClone(this.batches);
  }

  async remove(queuedAt: number): Promise<void> {
    this.batches = this.batches.filter((b) => b.queuedAt !== queuedAt);
  }
}
