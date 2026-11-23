import type { CanvasElement } from "../model/types";
import { SNAPSHOT_KEEP, type SnapshotMeta, type SnapshotStore } from "./snapshot-store";

type Row = { id: string; pageId: string; createdAt: number; elements: CanvasElement[] };

/** In-memory snapshot store with the same keep-latest-30 rule as the create_snapshot SQL function. */
export class MemorySnapshotStore implements SnapshotStore {
  private rows: Row[] = [];
  private seq = 0;

  private forPage(pageId: string): Row[] {
    return this.rows.filter((r) => r.pageId === pageId).sort((a, b) => b.createdAt - a.createdAt || (b.id < a.id ? -1 : 1));
  }

  async list(pageId: string): Promise<SnapshotMeta[]> {
    return this.forPage(pageId).map((r) => ({ id: r.id, createdAt: r.createdAt, elementCount: r.elements.length }));
  }

  async latestAt(pageId: string): Promise<number | null> {
    return this.forPage(pageId)[0]?.createdAt ?? null;
  }

  async load(snapshotId: string): Promise<CanvasElement[]> {
    const row = this.rows.find((r) => r.id === snapshotId);
    if (!row) throw new Error("snapshot not found");
    return structuredClone(row.elements);
  }

  async create(pageId: string, elements: CanvasElement[], at: number): Promise<void> {
    this.rows.push({ id: `snap-${String(++this.seq).padStart(8, "0")}`, pageId, createdAt: at, elements: structuredClone(elements) });
    const drop = new Set(this.forPage(pageId).slice(SNAPSHOT_KEEP).map((r) => r.id));
    if (drop.size > 0) this.rows = this.rows.filter((r) => !drop.has(r.id));
  }
}
