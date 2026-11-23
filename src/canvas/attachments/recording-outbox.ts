import { get, update } from "idb-keyval";
import { QUEUE_DRAIN_TIMEOUT_MS, withTimeout } from "../persistence/store";

/** A finished recording that is not yet a saved card. `assetPath` is set once it is uploaded. */
export type OutboxEntry = {
  id: string;
  blob: Blob;
  mime: string;
  durationMs: number;
  /** Top-left of the card, in world units. */
  x: number;
  y: number;
  createdAt: number;
  assetPath?: string;
};

/**
 * Durable holding place for finished recordings, scoped to one page. An entry is written before
 * the upload starts and removed only once the card is saved, so closing the tab, navigating away or
 * a failed upload can never lose a recording.
 */
export interface RecordingOutbox {
  put(entry: OutboxEntry): Promise<void>;
  list(): Promise<OutboxEntry[]>;
  remove(id: string): Promise<void>;
}

export const recordingsKey = (pageId: string) => `studiesphere:recordings:${pageId}`;

/** IndexedDB (idb-keyval), one key per page. Every call is bounded so a hung database never blocks. */
export class IdbRecordingOutbox implements RecordingOutbox {
  constructor(
    readonly pageId: string,
    private timeoutMs = QUEUE_DRAIN_TIMEOUT_MS,
  ) {}

  put(entry: OutboxEntry): Promise<void> {
    return withTimeout(
      update<OutboxEntry[]>(recordingsKey(this.pageId), (cur) => [...(cur ?? []).filter((e) => e.id !== entry.id), entry]),
      this.timeoutMs,
      undefined,
    );
  }

  list(): Promise<OutboxEntry[]> {
    return withTimeout(
      get<OutboxEntry[]>(recordingsKey(this.pageId)).then((v) => v ?? []),
      this.timeoutMs,
      [],
    );
  }

  remove(id: string): Promise<void> {
    return withTimeout(
      update<OutboxEntry[]>(recordingsKey(this.pageId), (cur) => (cur ?? []).filter((e) => e.id !== id)),
      this.timeoutMs,
      undefined,
    );
  }
}

/** In-memory outbox (tests, dev canvas). Writes land synchronously. */
export class MemoryRecordingOutbox implements RecordingOutbox {
  private entries = new Map<string, OutboxEntry>();

  put(entry: OutboxEntry): Promise<void> {
    this.entries.set(entry.id, entry);
    return Promise.resolve();
  }

  list(): Promise<OutboxEntry[]> {
    return Promise.resolve([...this.entries.values()].sort((a, b) => a.createdAt - b.createdAt));
  }

  remove(id: string): Promise<void> {
    this.entries.delete(id);
    return Promise.resolve();
  }
}
