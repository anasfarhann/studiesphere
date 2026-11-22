import type { CanvasElement } from "../model/types";

/** Row-level persistence for one page's elements. */
export interface ElementStore {
  /** Live (deleted = false) elements of the page. */
  load(pageId: string): Promise<CanvasElement[]>;
  /**
   * Row-level upsert; deletes set deleted = true. Per element the newer updatedAt wins:
   * an older upsert never overwrites a newer row, and never undoes a delete.
   */
  save(pageId: string, upserts: CanvasElement[], deletes: string[]): Promise<void>;
}

export type SaveState = "saved" | "saving" | "offline" | "error";

export type SaveBatch = { pageId: string; upserts: CanvasElement[]; deletes: string[]; queuedAt: number };

/**
 * Durable outbox of batches not yet confirmed by the server, scoped to one page.
 * `drain` lists the batches (oldest first) WITHOUT removing them: a batch leaves the queue only
 * through `remove`, after the server confirmed it, so a crash at any point cannot lose it.
 */
export interface OfflineQueue {
  push(batch: SaveBatch): Promise<void>;
  drain(): Promise<SaveBatch[]>;
  /** Forget the batch with this queuedAt (it was saved). */
  remove(queuedAt: number): Promise<void>;
}

/** A store failure the server reported (not a network failure): shown as "error", still retried. */
export class ElementStoreError extends Error {
  constructor(
    message: string,
    readonly network: boolean,
  ) {
    super(message);
    this.name = "ElementStoreError";
  }
}

/**
 * Applies queued (unsaved) batches, oldest first, on top of elements loaded from the server,
 * so edits made offline before a reload are visible again. Per element the newer updatedAt wins.
 */
export function applyBatches(elements: CanvasElement[], batches: SaveBatch[]): CanvasElement[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  for (const b of batches) {
    for (const el of b.upserts) {
      const cur = byId.get(el.id);
      if (!cur || el.updatedAt >= cur.updatedAt) byId.set(el.id, el);
    }
    for (const id of b.deletes) byId.delete(id);
  }
  return [...byId.values()];
}
