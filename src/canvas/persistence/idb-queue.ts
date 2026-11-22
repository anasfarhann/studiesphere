import { get, update } from "idb-keyval";
import type { OfflineQueue, SaveBatch } from "./store";

export const queueKey = (pageId: string) => `studiesphere:queue:${pageId}`;

/**
 * Offline queue in IndexedDB (idb-keyval), one key per page, so unsaved batches survive a reload,
 * a crash or a closed tab. Each write is a single read-modify-write transaction (`update`), and
 * operations are additionally chained so they apply in call order.
 */
export class IdbOfflineQueue implements OfflineQueue {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(readonly pageId: string) {}

  private run<T>(op: () => Promise<T>): Promise<T> {
    const next = this.chain.then(op, op);
    this.chain = next.catch(() => undefined);
    return next;
  }

  push(batch: SaveBatch): Promise<void> {
    return this.run(() =>
      update<SaveBatch[]>(queueKey(this.pageId), (cur) => [
        ...(cur ?? []).filter((b) => b.id !== batch.id),
        batch,
      ]),
    );
  }

  drain(): Promise<SaveBatch[]> {
    return this.run(async () => {
      const cur = await get<SaveBatch[]>(queueKey(this.pageId));
      return [...(cur ?? [])].sort((a, b) => a.queuedAt - b.queuedAt);
    });
  }

  remove(id: string): Promise<void> {
    return this.run(() =>
      update<SaveBatch[]>(queueKey(this.pageId), (cur) => (cur ?? []).filter((b) => b.id !== id)),
    );
  }
}
