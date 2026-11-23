"use client";

import { useEffect, useState } from "react";
import { t } from "@/i18n/en";
import type { Editor } from "../editor";

/** Gap between the selection box and the menu, and the menu's height, in CSS pixels. */
const GAP = 8;
const MENU_H = 52;

type Pos = { left: number; top: number };

/** Floating actions above the current selection. Follows pan/zoom through the editor's selection events. */
export function SelectionMenu({ editor }: { editor: Editor }) {
  const [pos, setPos] = useState<Pos | null>(null);

  useEffect(() => {
    const sync = () => {
      const b = editor.getSelectionBounds();
      if (!b) {
        setPos(null);
        return;
      }
      const [x0, y0] = editor.camera.worldToScreen(b.minX, b.minY);
      const [x1] = editor.camera.worldToScreen(b.maxX, b.minY);
      // Above the box; if there is no room, just below the top edge of the view.
      const left = (x0 + x1) / 2;
      const top = Math.max(GAP, y0 - MENU_H - GAP);
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
    };
    sync();
    return editor.onSelectionChange(sync);
  }, [editor]);

  if (!pos) return null;
  return (
    <div
      role="toolbar"
      aria-label={t("selectionActions")}
      className="absolute z-10 flex -translate-x-1/2 touch-manipulation gap-1 rounded-3xl bg-card p-1.5 text-ink shadow-[0_8px_28px_rgba(27,26,31,0.12)]"
      style={{ left: pos.left, top: pos.top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => editor.deleteSelection()}
        className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-pink px-4 text-sm font-medium text-ink"
      >
        {t("deleteSelection")}
      </button>
    </div>
  );
}
