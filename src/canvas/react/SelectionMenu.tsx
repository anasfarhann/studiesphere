"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { t } from "@/i18n/en";
import type { Editor } from "../editor";
import { isScalable, SCALE_HANDLE_HIT_PX } from "../tools/selection-scale";
import { ColorSwatches } from "./ColorSwatches";
import { ToolOptions } from "./ToolOptions";

/** Gap between the selection box and the menu, and from the view's edges, in CSS pixels. */
const GAP = 8;

type Kind = "strokes" | "image" | "text" | "mixed";
/** `clear`: extra room to keep off the box's edges (the corner scale handles' touch targets reach outside it). */
type Anchor = { centerX: number; boxTop: number; boxBottom: number; clear?: number };
type View =
  | ({ mode: "selection"; kind: Kind; key: string; strokeColor: string } & Anchor)
  | ({ mode: "paste"; key: string } & Anchor);

/**
 * Where the menu goes (CSS px in the canvas box): centred above the selection, below it when there is
 * no room above, and always inside the view.
 */
export function placeMenu(o: Anchor & { menuW: number; menuH: number; viewW: number; viewH: number }): { left: number; top: number } {
  const left = Math.max(GAP, Math.min(o.centerX - o.menuW / 2, o.viewW - o.menuW - GAP));
  const clear = o.clear ?? 0;
  let top = o.boxTop - o.menuH - GAP - clear;
  if (top < GAP) {
    // No room above: below the box, or (a box filling the view) at the top of the view.
    const below = o.boxBottom + GAP + clear;
    top = below + o.menuH + GAP <= o.viewH ? below : GAP;
  }
  top = Math.max(GAP, Math.min(top, o.viewH - o.menuH - GAP));
  return { left, top };
}

function sameView(a: View | null, b: View | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function readView(editor: Editor): View | null {
  // The crop overlay replaces the menu while it is open.
  if (editor.crop.active) return null;
  const els = editor.selection.elements();
  if (els.length > 0) {
    const b = editor.getSelectionBounds();
    if (!b) return null;
    const [x0, y0] = editor.camera.worldToScreen(b.minX, b.minY);
    const [x1, y1] = editor.camera.worldToScreen(b.maxX, b.maxY);
    const strokes = els.filter((e) => e.type === "stroke");
    let kind: Kind = "mixed";
    if (strokes.length === els.length) kind = "strokes";
    else if (els.length === 1 && els[0].type === "image") kind = "image";
    else if (els.length === 1 && els[0].type === "text") kind = "text";
    const colors = new Set(strokes.map((s) => s.color.toLowerCase()));
    const strokeColor = colors.size === 1 ? strokes[0].color : "";
    const clear = isScalable(els) ? SCALE_HANDLE_HIT_PX / 2 : 0;
    return { mode: "selection", kind, key: editor.selection.ids.join(","), strokeColor, centerX: (x0 + x1) / 2, boxTop: y0, boxBottom: y1, clear };
  }
  const at = editor.getPasteAnchor();
  if (!at) return null;
  const [x, y] = editor.camera.worldToScreen(at[0], at[1]);
  return { mode: "paste", key: `paste:${at[0]},${at[1]}`, centerX: x, boxTop: y, boxBottom: y };
}

function MenuButton({ onClick, expanded, tone = "plain", label, children }: { onClick: () => void; expanded?: boolean; tone?: "plain" | "danger"; label?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={label}
      className={`inline-flex h-11 min-w-11 shrink-0 touch-manipulation cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-medium text-ink aria-expanded:bg-ink aria-expanded:text-card ${tone === "danger" ? "bg-pink" : "bg-card"}`}
    >
      {children}
    </button>
  );
}

/** Pen presets and wheel for recolouring the selected strokes. */
function StrokeColors({ editor, value }: { editor: Editor; value: string }) {
  const presets = useSyncExternalStore(
    (cb) => editor.onSettingsChange(cb),
    () => editor.settings.pen.presets,
    () => editor.settings.pen.presets,
  );
  const picking = useSyncExternalStore(
    (cb) => editor.onEyedropperChange(cb),
    () => editor.eyedropper === "armed",
    () => false,
  );
  return (
    <div role="group" aria-label={t("recolorSelectionFor")} className="flex w-[min(17rem,calc(100vw-2rem))] flex-col items-center gap-1 pt-1">
      <ColorSwatches
        presets={presets}
        value={value}
        onPick={(c) => editor.recolorSelection(c)}
        onWheelChange={(c) => editor.recolorSelection(c, { live: true })}
        onWheelCommit={() => editor.commitRecolor()}
        eyedropper={{ active: picking, onToggle: () => (picking ? editor.cancelEyedropper() : void editor.armEyedropper((c) => editor.recolorSelection(c))) }}
      />
    </div>
  );
}

function Actions({ editor, view }: { editor: Editor; view: View }) {
  const [colorOpen, setColorOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (view.mode === "paste") {
    return (
      <div className="flex gap-1">
        <MenuButton onClick={() => editor.paste()}>{t("pasteHere")}</MenuButton>
      </div>
    );
  }
  const copy = (
    <MenuButton
      onClick={() => {
        editor.copySelection();
        setCopied(true);
      }}
    >
      {copied ? t("copiedSelection") : t("copySelection")}
    </MenuButton>
  );
  const del = (
    <MenuButton tone="danger" onClick={() => editor.deleteSelection()}>
      {t("deleteSelection")}
    </MenuButton>
  );
  return (
    <>
      <div className="flex gap-1">
        {/* One image: its corner handle resizes it; Crop opens the crop overlay. */}
        {view.kind === "image" ? <MenuButton onClick={() => editor.beginCrop()}>{t("cropImage")}</MenuButton> : null}
        {view.kind === "text" ? <MenuButton onClick={() => editor.editSelectedText()}>{t("editText")}</MenuButton> : null}
        {view.kind === "text" ? (
          <MenuButton expanded={textOpen} label={t("textOptions")} onClick={() => setTextOpen((o) => !o)}>
            {t("textOptionsShort")}
          </MenuButton>
        ) : null}
        {del}
        {view.kind === "strokes" ? (
          <MenuButton expanded={colorOpen} onClick={() => setColorOpen((o) => !o)}>
            {t("recolorSelection")}
          </MenuButton>
        ) : null}
        {copy}
      </div>
      {view.kind === "text" && textOpen ? (
        <div role="group" aria-label={t("textOptions")} className="max-h-[max(9rem,calc(100dvh-15rem))] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain">
          <ToolOptions editor={editor} tool="text" />
        </div>
      ) : null}
      {view.kind === "strokes" && colorOpen ? <StrokeColors editor={editor} value={view.strokeColor} /> : null}
    </>
  );
}

function place(el: HTMLElement | null, view: View | null): void {
  if (!el || !view) return;
  const box = el.parentElement;
  const { left, top } = placeMenu({
    ...view,
    menuW: el.offsetWidth,
    menuH: el.offsetHeight,
    viewW: box?.clientWidth ?? window.innerWidth,
    viewH: box?.clientHeight ?? window.innerHeight,
  });
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

/**
 * Floating actions for the current selection (or a Paste offer after a tap on empty space). Follows
 * pan/zoom through the editor's selection events and stays inside the canvas box.
 */
export function SelectionMenu({ editor }: { editor: Editor }) {
  const [view, setView] = useState<View | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      const next = readView(editor);
      setView((cur) => (sameView(cur, next) ? cur : next));
    };
    sync();
    return editor.onSelectionChange(sync);
  }, [editor]);

  const viewRef = useRef<View | null>(null);
  // Placed after every render, before paint, and again whenever the menu's size changes (colour panel,
  // "Copied"): its size depends on its actions.
  useLayoutEffect(() => {
    viewRef.current = view;
    place(ref.current, view);
  });
  const hasView = view !== null;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => place(el, viewRef.current));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasView]);

  if (!view) return null;
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={t("selectionActions")}
      className="absolute z-10 flex max-w-[calc(100%-1rem)] touch-manipulation flex-col items-center gap-1 rounded-3xl bg-card p-1.5 text-ink shadow-[0_8px_28px_rgba(27,26,31,0.12)]"
      style={{ left: GAP, top: GAP }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Actions key={view.key} editor={editor} view={view} />
    </div>
  );
}
