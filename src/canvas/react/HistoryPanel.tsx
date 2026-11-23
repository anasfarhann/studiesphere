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
}

/** Side panel listing the page's saved versions (newest first), each with a Restore button. */
export function HistoryPanel({ store, pageId, editor, onClose }: HistoryPanelProps) {
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
      className="absolute inset-y-0 right-0 z-20 flex touch-manipulation w-72 max-w-full flex-col border-l bg-white text-gray-900 shadow-lg"
    >
      <div className="flex items-center justify-between border-b px-3 py-1">
        <h2 className="text-sm font-medium">{t("historyTitle")}</h2>
        <button type="button" onClick={onClose} className="inline-flex h-11 min-w-11 items-center justify-center rounded px-3 text-sm">
          {t("historyClose")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
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
              className="min-h-11 rounded border px-4"
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
              <li key={s.id} className="flex items-center justify-between gap-2 rounded border px-3 py-1">
                <div>
                  <time dateTime={new Date(s.createdAt).toISOString()} className="block">
                    {new Date(s.createdAt).toLocaleString()}
                  </time>
                  <span className="text-gray-600">
                    {s.elementCount === 1 ? t("historyElementsOne") : t("historyElementsMany").replace("{n}", String(s.elementCount))}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={restoring !== null}
                  onClick={() => void restore(s.id)}
                  className="min-h-11 min-w-11 rounded border px-3 disabled:opacity-40"
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
