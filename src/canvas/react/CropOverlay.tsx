"use client";

import { useEffect, useReducer, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { t } from "@/i18n/en";
import type { Editor } from "../editor";
import { CROP_HANDLE_HIT_PX, cropToWorld, type CropHandle } from "../tools/image-crop";

/** Edges first, so a corner (drawn later) wins where hit areas overlap on a small crop. */
const HANDLES: CropHandle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const KNOB_PX = 14;

function place(h: CropHandle, l: number, tp: number, w: number, hh: number): [number, number] {
  const x = h.includes("w") ? l : h.includes("e") ? l + w : l + w / 2;
  const y = h.includes("n") ? tp : h.includes("s") ? tp + hh : tp + hh / 2;
  return [x, y];
}

const btn =
  "inline-flex h-11 min-w-11 shrink-0 touch-manipulation cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-5 text-sm font-medium text-ink";

/**
 * Crop mode chrome over the canvas: dimmed outside, crop rectangle with eight handles (44 px hit areas),
 * and Done / Cancel / Reset. Everything outside its controls lets pointer events through to the canvas.
 */
export function CropOverlay({ editor }: { editor: Editor }) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => editor.onSelectionChange(tick), [editor]);

  const state = editor.cropState();
  if (!state) return null;

  const cam = editor.camera;
  const [fx0, fy0] = cam.worldToScreen(state.frame.x, state.frame.y);
  const [fx1, fy1] = cam.worldToScreen(state.frame.x + state.frame.w, state.frame.y + state.frame.h);
  const r = cropToWorld(state.frame, state.draft);
  const [cx0, cy0] = cam.worldToScreen(r.x, r.y);
  const [cx1, cy1] = cam.worldToScreen(r.x + r.w, r.y + r.h);
  const cw = cx1 - cx0;
  const ch = cy1 - cy0;

  const local = (e: ReactPointerEvent): [number, number] => {
    const b = root.current?.getBoundingClientRect();
    return [e.clientX - (b?.left ?? 0), e.clientY - (b?.top ?? 0)];
  };
  const down = (h: CropHandle) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const [sx, sy] = local(e);
    if (!editor.cropDragBegin(h, e.pointerId, e.pointerType, sx, sy)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already gone.
    }
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) return;
    const [sx, sy] = local(e);
    editor.cropDragMove(e.pointerId, sx, sy);
  };
  const end = (e: ReactPointerEvent<HTMLDivElement>) => editor.cropDragEnd(e.pointerId);

  return (
    <div ref={root} data-testid="crop-overlay" className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute overflow-hidden" style={{ left: fx0, top: fy0, width: fx1 - fx0, height: fy1 - fy0 }}>
        <div
          className="absolute border-2 border-white"
          style={{ left: cx0 - fx0, top: cy0 - fy0, width: cw, height: ch, boxShadow: "0 0 0 9999px rgba(27,26,31,0.5)" }}
        />
      </div>
      <div className="absolute border border-dashed border-ink/70" style={{ left: cx0, top: cy0, width: cw, height: ch }} />
      {HANDLES.map((h) => {
        const [x, y] = place(h, cx0, cy0, cw, ch);
        const edge = h.length === 1;
        const knobW = edge && (h === "n" || h === "s") ? 28 : KNOB_PX;
        const knobH = edge && (h === "e" || h === "w") ? 28 : KNOB_PX;
        return (
          <div
            key={h}
            data-testid={`crop-handle-${h}`}
            className="pointer-events-auto absolute flex items-center justify-center"
            style={{ left: x - CROP_HANDLE_HIT_PX / 2, top: y - CROP_HANDLE_HIT_PX / 2, width: CROP_HANDLE_HIT_PX, height: CROP_HANDLE_HIT_PX, touchAction: "none", cursor: `${h}-resize` }}
            onPointerDown={down(h)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          >
            <span className="rounded-sm border-2 border-white bg-[#2563eb] shadow" style={{ width: knobW, height: knobH }} />
          </div>
        );
      })}
      <div
        role="toolbar"
        aria-label={t("cropControls")}
        className="pointer-events-auto absolute left-1/2 flex max-w-[calc(100%-1rem)] -translate-x-1/2 gap-1 rounded-3xl bg-card p-1.5 shadow-[0_8px_28px_rgba(27,26,31,0.12)]"
        style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button type="button" className={`${btn} bg-card`} onClick={() => editor.crop.reset()}>
          {t("cropReset")}
        </button>
        <button type="button" className={`${btn} bg-card`} onClick={() => editor.crop.cancel()}>
          {t("cropCancel")}
        </button>
        <button type="button" className={`${btn} bg-ink text-card`} onClick={() => editor.crop.done()}>
          {t("cropDone")}
        </button>
      </div>
    </div>
  );
}
