"use client";

import { useEffect, useState } from "react";
import { t } from "@/i18n/en";
import type { Editor } from "../editor";
import type { SnapshotMeta, SnapshotStore } from "../persistence/snapshot-store";
import { restoreSnapshot } from "../persistence/snapshots";

type List = { status: "loading" } | { status: "error" } | { status: "ready"; items: SnapshotMeta[] };

export interface HistoryPanelProps {
  store: SnapshotStore;
  pageId: string;
  editor: Editor;
  onClose: () => void;
  /** Distance in px from the top of the canvas; the host passes the bottom of the top bar. */
  top?: number;
}

/** Side panel listing the page's saved versions (newest first), each with a Restore button. */
export function HistoryPanel({ store, pageId, editor, onClose, top = 0 }: HistoryPanelProps) {
  const [list, setList] = useState<List>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    store.list(pageId).then(
      (items) => {
        if (!cancelled) setList({ status: "ready", items });
      },
      () => {
        if (!cancelled) setList({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [store, pageId, attempt]);

  const restore = async (id: string) => {
    setRestoring(id);
    setRestoreFailed(false);
    try {
      await restoreSnapshot(store, pageId, id, editor.scene, editor.history, {
        beforeRestore: () => editor.text.commit(),
        afterRestore: () => editor.selection.clear(),
      });
      onClose();
    } catch {
      setRestoreFailed(true);
      setRestoring(null);
    }
  };

  return (
    <aside
      aria-label={t("historyTitle")}
      className="absolute bottom-3 right-3 z-20 flex w-80 max-w-[calc(100%-1.5rem)] touch-manipulation flex-col overflow-hidden rounded-3xl bg-card text-ink shadow-[0_8px_28px_rgba(27,26,31,0.14)]"
      style={{ top }}
    >
      <div className="flex items-center justify-between gap-2 px-5 py-2">
        <h2 className="text-base font-semibold">{t("historyTitle")}</h2>
        <button type="button" onClick={onClose} className="inline-flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-full bg-ground px-4 text-sm font-medium">
          {t("historyClose")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-sm">
        {restoreFailed ? (
          <p role="alert" className="mb-2 text-red-700">
            {t("historyRestoreError")}
          </p>
        ) : null}
        {list.status === "loading" ? <p role="status">{t("historyLoading")}</p> : null}
        {list.status === "error" ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p>{t("historyError")}</p>
            <button
              type="button"
              className="min-h-11 cursor-pointer rounded-full bg-ink px-5 font-medium text-white"
              onClick={() => {
                setList({ status: "loading" });
                setAttempt((n) => n + 1);
              }}
            >
              {t("tryAgain")}
            </button>
          </div>
        ) : null}
        {list.status === "ready" && list.items.length === 0 ? <p>{t("historyEmpty")}</p> : null}
        {list.status === "ready" && list.items.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {list.items.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-2xl bg-ground px-4 py-2">
                <div>
                  <time dateTime={new Date(s.createdAt).toISOString()} className="block">
                    {new Date(s.createdAt).toLocaleString()}
                  </time>
                  <span className="text-muted">
                    {s.elementCount === 1 ? t("historyElementsOne") : t("historyElementsMany").replace("{n}", String(s.elementCount))}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={restoring !== null}
                  onClick={() => void restore(s.id)}
                  className="min-h-11 min-w-11 cursor-pointer rounded-full bg-lavender px-4 font-medium disabled:opacity-40"
                >
                  {restoring === s.id ? t("historyRestoring") : t("historyRestore")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}
