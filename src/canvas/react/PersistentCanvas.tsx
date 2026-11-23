"use client";

import { useCallback, useEffect, useState } from "react";
import { t } from "@/i18n/en";
import type { Editor } from "../editor";
import type { CanvasElement } from "../model/types";
import { Autosave } from "../persistence/autosave";
import {
  applyBatches,
  QUEUE_DRAIN_TIMEOUT_MS,
  withTimeout,
  type ElementStore,
  type OfflineQueue,
  type SaveBatch,
  type SaveState,
} from "../persistence/store";
import { MemoryRecordingOutbox, type OutboxEntry, type RecordingOutbox } from "../attachments/recording-outbox";
import type { SnapshotStore } from "../persistence/snapshot-store";
import { SnapshotScheduler } from "../persistence/snapshots";
import { recoverRecordings } from "../tools/recover-recordings";
import { CanvasView, type AttachmentConfig } from "./CanvasView";
import { OversizeRecordings } from "./OversizeRecordings";
import { SaveStatus } from "./SaveStatus";

const SNAPSHOT_CHECK_MS = 60_000;

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; elements: CanvasElement[] };

export interface PersistentCanvasProps {
  pageId: string;
  store: ElementStore;
  queue: OfflineQueue;
  /** Photo uploads; omit to hide the Photo button. */
  attachments?: AttachmentConfig;
  /** Durable store for finished recordings; defaults to an in-memory one (survives nothing). */
  outbox?: RecordingOutbox;
  /** Version history; omit to hide it. */
  snapshots?: SnapshotStore;
}

/**
 * Loads a page's elements (plus any edits still waiting in the offline queue), then mounts the
 * canvas with autosave. The editor is never shown before the load finished, so an empty canvas
 * always means an empty page.
 */
export function PersistentCanvas({ pageId, store, queue, attachments: attachmentProps, outbox, snapshots }: PersistentCanvasProps) {
  const [attachments] = useState<AttachmentConfig | undefined>(() =>
    attachmentProps ? { ...attachmentProps, store, outbox: outbox ?? new MemoryRecordingOutbox() } : undefined,
  );
  const [recovered, setRecovered] = useState(0);
  const [oversize, setOversize] = useState<OutboxEntry[]>([]);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [parked, setParked] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // A hanging IndexedDB must not keep the page on "Loading…": treat it as an empty queue.
    const queued = withTimeout<SaveBatch[]>(
      Promise.resolve().then(() => queue.drain()),
      QUEUE_DRAIN_TIMEOUT_MS,
      [],
    );
    // Parked batches (refused by the server) are still the student's edits: show them too.
    const parkedBatches = withTimeout<SaveBatch[]>(
      Promise.resolve().then(() => queue.parked()),
      QUEUE_DRAIN_TIMEOUT_MS,
      [],
    );
    Promise.all([store.load(pageId), queued, parkedBatches]).then(
      ([elements, batches, parkedList]) => {
        // Defensive, like Autosave: only this page's batches, whatever the queue hands back.
        const all = [...parkedList, ...batches].filter((b) => b.pageId === pageId).sort((a, b) => a.queuedAt - b.queuedAt);
        if (!cancelled) setLoad({ status: "ready", elements: applyBatches(elements, all) });
      },
      () => {
        if (!cancelled) setLoad({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pageId, store, queue, attempt]);

  const onEditor = useCallback(
    (editor: Editor) => {
      const autosave = new Autosave(editor.scene, store, pageId, { queue });
      const offState = autosave.onState(setSaveState);
      const offParked = autosave.onParked(setParked);
      const off = () => {
        offState();
        offParked();
      };
      let mounted = true;
      let scheduler: SnapshotScheduler | null = null;
      let timer: ReturnType<typeof setInterval> | null = null;
      const onHide = () => {
        if (document.visibilityState === "hidden") void scheduler?.check();
      };
      if (snapshots) {
        scheduler = new SnapshotScheduler(editor.scene, snapshots, pageId);
        timer = setInterval(() => void scheduler?.check(), SNAPSHOT_CHECK_MS);
        document.addEventListener("visibilitychange", onHide);
        window.addEventListener("pagehide", onHide);
      }
      if (attachments?.outbox) {
        const { service, ownerId, outbox: box } = attachments;
        void recoverRecordings({
          outbox: box,
          store,
          scene: editor.scene,
          ownerId,
          pageId,
          upload: (blob, o) => service.uploadAttachment(blob, o),
          isMounted: () => mounted,
          onOversize: (entries) => {
            if (mounted) setOversize(entries);
          },
        }).then((n) => {
          if (n > 0 && mounted) setRecovered((c) => c + n);
        }, () => {});
      }
      return () => {
        mounted = false;
        if (timer) clearInterval(timer);
        document.removeEventListener("visibilitychange", onHide);
        window.removeEventListener("pagehide", onHide);
        scheduler?.dispose();
        off();
        // Final flush; whatever cannot be saved now stays queued for the next visit.
        void autosave.dispose();
      };
    },
    [store, pageId, queue, attachments, snapshots],
  );

  if (load.status === "loading") {
    return (
      <p role="status" className="m-auto text-sm text-gray-500">
        {t("pageLoading")}
      </p>
    );
  }
  if (load.status === "error") {
    return (
      <div role="alert" className="m-auto flex flex-col items-center gap-3 p-4 text-center text-sm">
        <p>{t("pageLoadError")}</p>
        <button
          type="button"
          className="min-h-11 rounded border px-4"
          onClick={() => {
            setLoad({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          {t("tryAgain")}
        </button>
      </div>
    );
  }
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <CanvasView elements={load.elements} attachments={attachments} onEditor={onEditor} snapshots={snapshots ? { store: snapshots, pageId } : undefined} />
      {recovered > 0 ? (
        <p role="status" className="absolute left-1/2 top-14 z-10 -translate-x-1/2 rounded bg-white px-3 py-2 text-sm text-gray-900 shadow">
          {t("recoveredRecordings").replace("{n}", String(recovered))}
        </p>
      ) : null}
      {attachments?.outbox ? (
        <OversizeRecordings
          entries={oversize}
          outbox={attachments.outbox}
          onRemoved={(id) => setOversize((cur) => cur.filter((e) => e.id !== id))}
        />
      ) : null}
      <div
        className="pointer-events-none absolute right-3"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <SaveStatus state={saveState} parked={parked > 0} />
      </div>
    </div>
  );
}
