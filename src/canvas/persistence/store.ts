import type { CanvasElement } from "../model/types";

/** A delete stamped by the client's clock, so it is ordered against upserts exactly like an edit. */
export type Tombstone = { id: string; updatedAt: number };

/** Row-level persistence for one page's elements. */
export interface ElementStore {
  /** Live (deleted = false) elements of the page. */
  load(pageId: string): Promise<CanvasElement[]>;
  /**
   * Row-level upsert; deletes set deleted = true. Per element the newer updatedAt wins (deletes carry
   * their own stamp): an older upsert never overwrites a newer row or undoes a newer delete, and an
   * older delete never hides a newer row.
   */
  save(pageId: string, upserts: CanvasElement[], deletes: Tombstone[]): Promise<void>;
}

export type SaveState = "saved" | "saving" | "offline" | "error";

/** `id` (random) identifies a batch in the queue; `queuedAt` only orders batches. */
export type SaveBatch = { id: string; pageId: string; upserts: CanvasElement[]; deletes: Tombstone[]; queuedAt: number };

/**
 * Durable outbox of batches not yet confirmed by the server, scoped to one page.
 * `drain` lists the batches (oldest first) WITHOUT removing them: a batch leaves the queue only
 * through `remove`, after the server confirmed it, so a crash at any point cannot lose it.
 */
export interface OfflineQueue {
  push(batch: SaveBatch): Promise<void>;
  drain(): Promise<SaveBatch[]>;
  /** Forget the batch with this id (it was saved). */
  remove(id: string): Promise<void>;
  /**
   * Sets a batch the server refused deterministically aside (and out of the regular queue), so later
   * batches can proceed. Parked batches are kept until `unpark`, which is only called once one saved.
   */
  park(batch: SaveBatch): Promise<void>;
  /** Parked batches, oldest first (not removed). */
  parked(): Promise<SaveBatch[]>;
  /** Forget a parked batch (it was saved after all). */
  unpark(id: string): Promise<void>;
}

/** How long a queue read may take before it is treated as empty (IndexedDB can hang in Safari). */
export const QUEUE_DRAIN_TIMEOUT_MS = 1000;

/** Resolves with `p`'s value, or with `fallback` if it rejects or takes longer than `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

/** Postgres statement_timeout: retried, but a batch that keeps timing out is split / set aside. */
export const STATEMENT_TIMEOUT_CODE = "57014";

/**
 * A store failure. `network`: the request never got an answer (offline, DNS, aborted).
 * `permanent`: the server refused the data itself (bad value, constraint, unknown function…), so
 * resending the same batch can never succeed. Everything else (5xx, auth, rate limit) is retried.
 */
export class ElementStoreError extends Error {
  readonly permanent: boolean;
  readonly code: string | undefined;

  constructor(
    message: string,
    readonly network: boolean,
    opts: { permanent?: boolean; code?: string } = {},
  ) {
    super(message);
    this.name = "ElementStoreError";
    this.permanent = opts.permanent ?? false;
    this.code = opts.code;
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
    for (const d of b.deletes) {
      const cur = byId.get(d.id);
      if (cur && cur.updatedAt <= d.updatedAt) byId.delete(d.id);
    }
  }
  return [...byId.values()];
}
