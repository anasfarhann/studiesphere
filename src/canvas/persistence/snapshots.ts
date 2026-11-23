import type { History, Change } from "../model/history";
import type { Scene } from "../model/scene";
import type { CanvasElement } from "../model/types";
import type { SnapshotStore } from "./snapshot-store";

export const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Snapshots the page when at least 60 minutes passed since the last snapshot (`lastSnapshotAt`, null =
 * never) AND the page changed since then (`changed`). Returns the snapshot time, or null when skipped.
 */
export async function maybeSnapshot(
  store: SnapshotStore,
  pageId: string,
  scene: Scene,
  lastSnapshotAt: number | null,
  now: number,
  changed: boolean,
): Promise<number | null> {
  if (!changed) return null;
  if (lastSnapshotAt !== null && now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return null;
  await store.create(pageId, scene.all(), now);
  return now;
}

function withoutStamp(el: CanvasElement): Partial<CanvasElement> {
  const patch: Partial<CanvasElement> = { ...el };
  delete patch.updatedAt;
  return patch;
}

/**
 * Replaces the page's content with a snapshot, through the Scene (so everything is stamped fresh and
 * autosave saves it like any edit) and as one undoable history step.
 *
 * Restoring is never destructive: the current state is snapshotted first, so it stays available in the
 * history list even after the undo stack is gone. If that snapshot or the load fails, the scene is untouched.
 */
export async function restoreSnapshot(
  store: SnapshotStore,
  pageId: string,
  snapshotId: string,
  scene: Scene,
  history: History,
  now: number = Date.now(),
): Promise<Change> {
  const target = await store.load(snapshotId);
  await store.create(pageId, scene.all(), now);

  const before = scene.all();
  const keep = new Set(target.map((e) => e.id));
  for (const el of before) if (!keep.has(el.id)) scene.remove(el.id);
  for (const el of target) {
    if (scene.get(el.id)) scene.update(el.id, withoutStamp(el));
    else scene.add({ ...el, updatedAt: Math.max(el.updatedAt, Date.now()) });
  }
  const change: Change = { before, after: target };
  history.push(change);
  return change;
}

/**
 * Per-page driver: remembers whether the scene changed since the last snapshot and takes one when due.
 * Call `check()` on an interval and on page hide.
 */
export class SnapshotScheduler {
  private changed = false;
  private last: number | null = null;
  private ready: Promise<void>;
  private busy = false;
  private off: () => void;

  constructor(
    private scene: Scene,
    private store: SnapshotStore,
    private pageId: string,
    private now: () => number = () => Date.now(),
  ) {
    this.off = scene.onChange(() => {
      this.changed = true;
    });
    this.ready = store.latestAt(pageId).then(
      (t) => {
        this.last = t;
      },
      () => undefined, // unknown: treated as never snapshotted; worst case one extra snapshot
    );
  }

  /** Takes a snapshot if one is due. Errors are swallowed: history is best effort and retried at the next check. */
  async check(): Promise<void> {
    await this.ready;
    if (this.busy || !this.changed) return;
    this.busy = true;
    const wasChanged = this.changed;
    this.changed = false;
    try {
      const at = await maybeSnapshot(this.store, this.pageId, this.scene, this.last, this.now(), wasChanged);
      if (at === null) this.changed = true;
      else this.last = at;
    } catch {
      this.changed = true;
    } finally {
      this.busy = false;
    }
  }

  dispose(): void {
    this.off();
  }
}
