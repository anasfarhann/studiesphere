"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import type { PreviewTarget } from "../preview/page-preview";
import { PagePreviews, type PreviewSink } from "../preview/preview-scheduler";
import { LivePageTargetProvider } from "./live-page-target";
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
  /** The title pill shown at the top left of the canvas (also while loading). */
  header?: ReactNode;
  /** Extra notices for the bottom stack (dev demos). */
  extraNotices?: ReactNode;
  /** Where the page's card preview goes; omit for no previews. */
  preview?: PreviewSink;
}

/**
 * Loads a page's elements (plus any edits still waiting in the offline queue), then mounts the
 * canvas with autosave. The editor is never shown before the load finished, so an empty canvas
 * always means an empty page.
 */
export function PersistentCanvas({ pageId, store, queue, attachments: attachmentProps, outbox, snapshots, header, extraNotices, preview }: PersistentCanvasProps) {
  const [attachments] = useState<AttachmentConfig | undefined>(() =>
    attachmentProps ? { ...attachmentProps, store, outbox: outbox ?? new MemoryRecordingOutbox() } : undefined,
  );
  const [recovered, setRecovered] = useState(0);
  const [oversize, setOversize] = useState<OutboxEntry[]>([]);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [parked, setParked] = useState(0);
  const [liveTarget, setLiveTarget] = useState<PreviewTarget | null>(null);

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
      const target: PreviewTarget = {
        elements: () => editor.scene.all(),
        drawSnapshot: (ctx, camera, w, h, o) => editor.drawSnapshot(ctx, camera, w, h, o),
        preloadImages: (area) => editor.preloadImages(area),
        hasTaintedImages: (area) => editor.hasTaintedImages(area),
        isInteracting: () => editor.isInteracting(),
        onChange: (fn) => editor.scene.onChange(fn),
      };
      setLiveTarget(target);
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
      // Card preview: drawn off the input path, throttled; one more on leave (tab hidden or unmount) when dirty.
      let previews: PagePreviews | null = null;
      const onHidePreview = () => {
        if (document.visibilityState === "hidden") previews?.flush();
      };
      const onPageHidePreview = () => previews?.flush();
      if (preview) {
        previews = new PagePreviews({
          target,
          sink: preview,
          onChange: (fn) => editor.scene.onChange(fn),
        });
        previews.start();
        document.addEventListener("visibilitychange", onHidePreview);
        window.addEventListener("pagehide", onPageHidePreview);
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
        setLiveTarget((cur) => (cur === target ? null : cur));
        if (timer) clearInterval(timer);
        document.removeEventListener("visibilitychange", onHide);
        window.removeEventListener("pagehide", onHide);
        scheduler?.dispose();
        document.removeEventListener("visibilitychange", onHidePreview);
        window.removeEventListener("pagehide", onPageHidePreview);
        // Draws synchronously while the editor still exists; encoding and upload finish in the background.
        previews?.dispose();
        off();
        // Final flush; whatever cannot be saved now stays queued for the next visit.
        void autosave.dispose();
      };
    },
    [store, pageId, queue, attachments, snapshots, preview],
  );

  // While loading or after a failure there is no canvas bar yet: keep the way back reachable.
  const headerOnly = header ? (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3">
      <div className="pointer-events-auto w-fit max-w-full">{header}</div>
    </div>
  ) : null;
  if (load.status === "loading") {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        {headerOnly}
        <p role="status" className="m-auto text-sm text-muted">
          {t("pageLoading")}
        </p>
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        {headerOnly}
        <div role="alert" className="m-auto flex flex-col items-center gap-3 p-4 text-center text-sm">
          <p>{t("pageLoadError")}</p>
          <button
            type="button"
            className="min-h-11 cursor-pointer rounded-full bg-ink px-5 font-medium text-white"
            onClick={() => {
              setLoad({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
          >
            {t("tryAgain")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <LivePageTargetProvider value={liveTarget}>
    <div className="relative flex min-h-0 flex-1 flex-col">
      <CanvasView
        elements={load.elements}
        attachments={attachments}
        onEditor={onEditor}
        snapshots={snapshots ? { store: snapshots, pageId } : undefined}
        topLeft={header}
        status={<SaveStatus state={saveState} parked={parked > 0} />}
        notices={
          <>
            {recovered > 0 ? (
              <p role="status" className="pointer-events-auto max-w-full rounded-3xl bg-card px-4 py-2 text-sm text-ink shadow-[0_8px_28px_rgba(27,26,31,0.12)]">
                {t("recoveredRecordings").replace("{n}", String(recovered))}
              </p>
            ) : null}
            {extraNotices}
            {attachments?.outbox ? (
              <OversizeRecordings
                entries={oversize}
                outbox={attachments.outbox}
                onRemoved={(id) => setOversize((cur) => cur.filter((e) => e.id !== id))}
              />
            ) : null}
          </>
        }
      />
    </div>
    </LivePageTargetProvider>
  );
}
