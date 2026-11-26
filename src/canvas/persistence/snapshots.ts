import { patchToward, type History, type Change } from "../model/history";
import type { Scene } from "../model/scene";
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

export interface RestoreOptions {
  /** Clock for the pre-restore snapshot and the restored elements' stamps; default Date.now(). */
  now?: number;
  /** Runs before the current state is snapshotted (commit an open text box). */
  beforeRestore?: () => void;
  /** Runs after the scene changed (clear the selection). */
  afterRestore?: () => void;
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
  opts: RestoreOptions = {},
): Promise<Change> {
  const now = opts.now ?? Date.now();
  // Pending UI state (an open text box) must be in the scene before it is snapshotted.
  opts.beforeRestore?.();
  const target = await store.load(snapshotId);
  await store.create(pageId, scene.all(), now);

  const before = scene.all();
  const keep = new Set(target.map((e) => e.id));
  scene.batch(() => {
    for (const el of before) if (!keep.has(el.id)) scene.remove(el.id);
    // Stamps come from the injected clock: an element deleted in an earlier session has a tombstone this
    // Scene does not know, so it must be newer than any earlier real-time delete.
    for (const el of target) {
      const cur = scene.get(el.id);
      if (cur) scene.update(el.id, { ...patchToward(cur, el), updatedAt: Math.max(now, cur.updatedAt + 1) });
      else scene.add({ ...el, updatedAt: Math.max(el.updatedAt, now) });
    }
  });
  const change: Change = { before, after: target };
  history.push(change);
  opts.afterRestore?.();
  return change;
}

const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 30 * 60_000;

/**
 * Per-page driver: remembers whether the scene changed since the last snapshot and takes one when due.
 * Call `check()` on an interval and on page hide.
 *
 * Size: a snapshot is the page's full element JSON and 30 are kept per page, so a very large page can be
 * several MB per snapshot and may be rejected by the server. Failures back off exponentially (1 min doubling
 * to 30 min, reset on success) and are logged once per failure streak.
 */
export class SnapshotScheduler {
  private changed = false;
  private last: number | null = null;
  private ready: Promise<void>;
  private busy = false;
  private failures = 0;
  private retryAt = 0;
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
    if (this.busy || !this.changed || this.now() < this.retryAt) return;
    this.busy = true;
    const wasChanged = this.changed;
    this.changed = false;
    try {
      const at = await maybeSnapshot(this.store, this.pageId, this.scene, this.last, this.now(), wasChanged);
      if (at === null) this.changed = true;
      else {
        this.last = at;
        this.failures = 0;
        this.retryAt = 0;
      }
    } catch (err) {
      this.changed = true;
      if (this.failures === 0) console.warn("Page snapshot failed; will retry with backoff", err);
      this.retryAt = this.now() + Math.min(BACKOFF_BASE_MS * 2 ** this.failures, BACKOFF_MAX_MS);
      this.failures++;
    } finally {
      this.busy = false;
    }
  }

  dispose(): void {
    this.off();
  }
}
