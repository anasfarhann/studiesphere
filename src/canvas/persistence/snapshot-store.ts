import type { CanvasElement } from "../model/types";

/** One row of the history list. `createdAt` is epoch ms. */
export type SnapshotMeta = { id: string; createdAt: number; elementCount: number };

/** The server keeps this many snapshots per page; older ones are deleted by the save function. */
export const SNAPSHOT_KEEP = 30;

/** Version history of one page. */
export interface SnapshotStore {
  /** Newest first. Does not load the elements. */
  list(pageId: string): Promise<SnapshotMeta[]>;
  /** createdAt of the newest snapshot, or null when there is none. */
  latestAt(pageId: string): Promise<number | null>;
  /** The elements of one snapshot; rejects when it does not exist. */
  load(snapshotId: string): Promise<CanvasElement[]>;
  /** Saves a snapshot and prunes the page to the latest SNAPSHOT_KEEP. `at` is the client clock (epoch ms). */
  create(pageId: string, elements: CanvasElement[], at: number): Promise<void>;
}
