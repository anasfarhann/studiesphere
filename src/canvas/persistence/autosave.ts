import type { Scene } from "../model/scene";
import { MemoryOfflineQueue } from "./memory-store";
import {
  ElementStoreError,
  QUEUE_DRAIN_TIMEOUT_MS,
  withTimeout,
  type ElementStore,
  type OfflineQueue,
  type SaveBatch,
  type SaveState,
} from "./store";

export interface AutosaveOptions {
  /** Quiet time after the last change before saving. Default 1500 ms (meets the 2 s rule). */
  debounceMs?: number;
  /** Longest a change waits while edits keep coming. Default 5000 ms. */
  maxWaitMs?: number;
  /** Durable outbox; defaults to an in-memory one. */
  queue?: OfflineQueue;
  /** Online detection; defaults to navigator.onLine. */
  isOnline?: () => boolean;
  now?: () => number;
  newId?: () => string;
}

const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 60_000;

/**
 * Saves a scene's changed elements to a store.
 *
 * Every batch taken from the scene goes into an in-memory outbox AND the durable queue (write-ahead)
 * before its network save; it leaves both only after the store confirmed it. Batches are saved one at
 * a time, oldest first, so queued (offline / earlier-visit) batches always reach the server before newer
 * ones. Nothing taken from the scene is ever dropped: failures keep the batch and retry with backoff.
 *
 * The durable queue is best effort and never on the save path: pushes and removes are fire-and-forget
 * (the queue orders them itself), and the startup read gives up after QUEUE_DRAIN_TIMEOUT_MS, so a
 * hanging IndexedDB cannot delay or block network saves.
 */
export class Autosave {
  private debounceMs: number;
  private maxWaitMs: number;
  private queue: OfflineQueue;
  private isOnline: () => boolean;
  private now: () => number;
  private newId: () => string;

  private outbox: SaveBatch[] = [];
  private lastQueuedAt = 0;
  private started: Promise<void>;
  private chain: Promise<void> = Promise.resolve();

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;

  private state: SaveState = "saved";
  private listeners = new Set<(s: SaveState) => void>();
  private unsubscribeScene: () => void;
  private disposed = false;

  constructor(
    private scene: Scene,
    private store: ElementStore,
    private pageId: string,
    opts: AutosaveOptions = {},
  ) {
    this.debounceMs = opts.debounceMs ?? 1500;
    this.maxWaitMs = opts.maxWaitMs ?? 5000;
    this.queue = opts.queue ?? new MemoryOfflineQueue(pageId);
    this.isOnline = opts.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine !== false);
    this.now = opts.now ?? (() => Date.now());
    this.newId = opts.newId ?? (() => crypto.randomUUID());

    this.unsubscribeScene = scene.onChange(this.onSceneChange);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibility);
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.onPageHide);
      window.addEventListener("online", this.onOnline);
    }
    this.started = this.loadQueued();
    // Replay anything left over from an earlier visit right away.
    void this.started.then(() => {
      // After dispose, its final flush already covers the outbox.
      if (!this.disposed && this.outbox.length > 0) void this.pump();
    });
  }

  /** Takes the scene's pending changes and saves everything outstanding. */
  flush(): Promise<void> {
    this.clearDebounce();
    this.enqueueDirty();
    return this.pump();
  }

  onState(fn: (s: SaveState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Final flush; stops listening. Unsaved batches stay in the durable queue for the next visit. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.unsubscribeScene();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.onPageHide);
      window.removeEventListener("online", this.onOnline);
    }
    this.clearRetry();
    const done = this.flush();
    this.disposed = true;
    await done;
    this.clearRetry();
    this.listeners.clear();
  }

  // ---------------------------------------------------------------- internals

  private async loadQueued(): Promise<void> {
    // Unreadable or hanging queue (IndexedDB unavailable / stuck): nothing to replay this visit.
    // Its batches stay stored and are replayed on a later visit.
    const read = Promise.resolve().then(() => this.queue.drain());
    const queued = (await withTimeout(read, QUEUE_DRAIN_TIMEOUT_MS, [])).filter((b) => b.pageId === this.pageId);
    const known = new Set(this.outbox.map((b) => b.id));
    const earlier = queued.filter((b) => !known.has(b.id)).sort((a, b) => a.queuedAt - b.queuedAt);
    for (const b of earlier) this.lastQueuedAt = Math.max(this.lastQueuedAt, b.queuedAt);
    // Batches from earlier visits are older than anything taken since construction: they go first.
    this.outbox = [...earlier, ...this.outbox];
    if (this.outbox.length > 0 && this.state === "saved") this.setState("saving");
  }

  private onSceneChange = (): void => {
    if (this.disposed) return;
    if (this.state === "saved") this.setState("saving");
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.flush(), this.debounceMs);
    this.maxWaitTimer ??= setTimeout(() => void this.flush(), this.maxWaitMs);
  };

  private onVisibility = (): void => {
    if (document.visibilityState === "hidden") void this.flush();
  };

  private onPageHide = (): void => {
    void this.flush();
  };

  private onOnline = (): void => {
    this.clearRetry();
    this.failures = 0;
    void this.pump();
  };

  private clearDebounce(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** Moves the scene's dirty set into a batch: outbox + durable queue, before any network attempt. */
  private enqueueDirty(): void {
    const { upserts, deletes } = this.scene.takeDirty();
    if (upserts.length === 0 && deletes.length === 0) return;
    const queuedAt = Math.max(this.now(), this.lastQueuedAt + 1);
    this.lastQueuedAt = queuedAt;
    const batch: SaveBatch = { id: this.newId(), pageId: this.pageId, upserts, deletes, queuedAt };
    this.outbox.push(batch);
    this.queueOp(() => this.queue.push(batch));
  }

  /** Serialised save passes: each pass saves the outbox oldest-first until empty or a failure. */
  private pump(): Promise<void> {
    this.chain = this.chain.then(() => this.pass());
    return this.chain;
  }

  private async pass(): Promise<void> {
    await this.started;
    while (this.outbox.length > 0) {
      const batch = this.outbox[0];
      if (this.state === "saved") this.setState("saving");
      try {
        await this.store.save(batch.pageId, batch.upserts, batch.deletes);
      } catch (err) {
        this.onFailure(err);
        return;
      }
      this.outbox.shift();
      // Not awaited: the queue applies it after the batch's push, and a hang must not delay the next save.
      this.queueOp(() => this.queue.remove(batch.id));
      this.failures = 0;
      this.clearRetry();
    }
    this.setState(this.debounceTimer ? "saving" : "saved");
  }

  /** Fire-and-forget queue write; errors (quota, private mode, unavailable) are ignored. */
  private queueOp(op: () => Promise<void>): void {
    try {
      op().catch(() => undefined);
    } catch {
      // synchronous throw from the queue: ignore, the in-memory outbox still has the batch
    }
  }

  private onFailure(err: unknown): void {
    const serverError = err instanceof ElementStoreError && !err.network;
    this.setState(serverError && this.isOnline() ? "error" : "offline");
    if (this.disposed) return;
    const delay = Math.min(RETRY_BASE_MS * 2 ** this.failures, RETRY_MAX_MS);
    this.failures++;
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.pump();
    }, delay);
  }

  private setState(s: SaveState): void {
    if (s === this.state) return;
    this.state = s;
    for (const fn of [...this.listeners]) fn(s);
  }
}
