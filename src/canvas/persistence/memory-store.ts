import type { CanvasElement } from "../model/types";
import type { ElementStore, OfflineQueue, SaveBatch, Tombstone } from "./store";

type Row = { el: CanvasElement; deleted: boolean; updatedAt: number };

/** In-memory store with the same per-element merge rules as the save_elements SQL function. */
export class MemoryElementStore implements ElementStore {
  private pages = new Map<string, Map<string, Row>>();

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

  async save(pageId: string, upserts: CanvasElement[], deletes: Tombstone[]): Promise<void> {
    const rows = this.rows(pageId);
    for (const el of upserts) {
      const cur = rows.get(el.id);
      if (cur && el.updatedAt < cur.updatedAt) continue;
      rows.set(el.id, { el: structuredClone(el), deleted: false, updatedAt: el.updatedAt });
    }
    for (const d of deletes) {
      const cur = rows.get(d.id);
      if (!cur) continue; // never saved: nothing to tombstone
      if (d.updatedAt < cur.updatedAt) continue; // a newer write wins
      cur.deleted = true;
      cur.updatedAt = d.updatedAt;
    }
  }
}

/** Offline queue kept in memory (tests, dev canvas). Survives nothing. */
export class MemoryOfflineQueue implements OfflineQueue {
  private batches: SaveBatch[] = [];

  constructor(readonly pageId: string) {}

  async push(batch: SaveBatch): Promise<void> {
    this.batches = [...this.batches.filter((b) => b.id !== batch.id), structuredClone(batch)];
  }

  async drain(): Promise<SaveBatch[]> {
    return structuredClone(this.batches);
  }

  async remove(id: string): Promise<void> {
    this.batches = this.batches.filter((b) => b.id !== id);
  }
}
