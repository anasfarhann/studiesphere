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
import { CanvasView } from "./CanvasView";
import { SaveStatus } from "./SaveStatus";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; elements: CanvasElement[] };

export interface PersistentCanvasProps {
  pageId: string;
  store: ElementStore;
  queue: OfflineQueue;
}

/**
 * Loads a page's elements (plus any edits still waiting in the offline queue), then mounts the
 * canvas with autosave. The editor is never shown before the load finished, so an empty canvas
 * always means an empty page.
 */
export function PersistentCanvas({ pageId, store, queue }: PersistentCanvasProps) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");

  useEffect(() => {
    let cancelled = false;
    // A hanging IndexedDB must not keep the page on "Loading…": treat it as an empty queue.
    const queued = withTimeout<SaveBatch[]>(
      Promise.resolve().then(() => queue.drain()),
      QUEUE_DRAIN_TIMEOUT_MS,
      [],
    );
    Promise.all([store.load(pageId), queued]).then(
      ([elements, batches]) => {
        if (!cancelled) setLoad({ status: "ready", elements: applyBatches(elements, batches) });
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
      const off = autosave.onState(setSaveState);
      return () => {
        off();
        // Final flush; whatever cannot be saved now stays queued for the next visit.
        void autosave.dispose();
      };
    },
    [store, pageId, queue],
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
      <CanvasView elements={load.elements} onEditor={onEditor} />
      <div
        className="pointer-events-none absolute right-3"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <SaveStatus state={saveState} />
      </div>
    </div>
  );
}
