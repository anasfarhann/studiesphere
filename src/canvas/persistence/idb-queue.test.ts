import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IdbOfflineQueue } from "./idb-queue";
import type { SaveBatch } from "./store";

const batch = (queuedAt: number, pageId = "p1"): SaveBatch => ({ id: `b${queuedAt}`, pageId, upserts: [], deletes: [{ id: `d${queuedAt}`, updatedAt: queuedAt }], queuedAt });

describe("IdbOfflineQueue", () => {
  it("keeps batches across instances (a reload) until removed, oldest first, per page", async () => {
    const q = new IdbOfflineQueue("p1");
    await Promise.all([q.push(batch(3)), q.push(batch(1)), q.push(batch(2))]);
    await new IdbOfflineQueue("p2").push(batch(9, "p2"));
    const reloaded = new IdbOfflineQueue("p1");
    expect((await reloaded.drain()).map((b) => b.queuedAt)).toEqual([1, 2, 3]);
    expect((await reloaded.drain()).length).toBe(3); // drain does not remove
    await reloaded.remove("b2");
    expect((await new IdbOfflineQueue("p1").drain()).map((b) => b.queuedAt)).toEqual([1, 3]);
    expect((await new IdbOfflineQueue("p2").drain()).map((b) => b.queuedAt)).toEqual([9]);
  });
});
