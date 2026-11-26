import { CARD_H, CARD_W } from "../model/bounds";
import type { Change, History } from "../model/history";
import type { Scene } from "../model/scene";
import { measureTextBox } from "../model/text-layout";
import type { TextStyleFields } from "../model/text-style";
import type { CanvasElement, Rect, TextEl } from "../model/types";
import { approxMeasureFor, type Measure } from "../model/wrap-text";
import type { Selection } from "../selection";

/** Touch target of each corner handle in screen pixels (drawn as the photo handle, HANDLE_DRAW_PX). */
export const SCALE_HANDLE_HIT_PX = 44;
/** The selection's longer side never gets smaller than this on screen. */
export const MIN_SELECTION_PX = 8;

export type Corner = "nw" | "ne" | "sw" | "se";
const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];

/**
 * Whether a selection gets the four corner scale handles: one stroke, or several elements of any kind.
 * A single photo or text box keeps its own handle; a single card has none.
 */
export function isScalable(els: readonly CanvasElement[]): boolean {
  if (els.length > 1) return true;
  return els.length === 1 && els[0].type === "stroke";
}

/** The corner's point on `b` (world). */
export function cornerPoint(b: Rect, c: Corner): [number, number] {
  return [c === "nw" || c === "sw" ? b.minX : b.maxX, c === "nw" || c === "ne" ? b.minY : b.maxY];
}

const opposite: Record<Corner, Corner> = { nw: "se", ne: "sw", sw: "ne", se: "nw" };

/**
 * The corner handle under (x, y), or null. Each target is 44 screen px but reaches at most a quarter of the
 * box inside it, so a small selection can still be moved by dragging its middle.
 */
export function cornerAt(b: Rect, x: number, y: number, zoom: number): Corner | null {
  const half = SCALE_HANDLE_HIT_PX / 2 / zoom;
  const inX = Math.min(half, (b.maxX - b.minX) / 4);
  const inY = Math.min(half, (b.maxY - b.minY) / 4);
  for (const c of CORNERS) {
    const [cx, cy] = cornerPoint(b, c);
    const west = c === "nw" || c === "sw";
    const north = c === "nw" || c === "ne";
    const okX = west ? x >= cx - half && x <= cx + inX : x >= cx - inX && x <= cx + half;
    const okY = north ? y >= cy - half && y <= cy + inY : y >= cy - inY && y <= cy + half;
    if (okX && okY) return c;
  }
  return null;
}

/**
 * `el` scaled by `s` about (ax, ay). Strokes scale their points and size (so their drawn width, legacy 3x
 * highlighters included, scales too); photos their box (crop untouched); text its position and font size, with
 * a fixed box's wrap width scaled and an auto box re-measured; file and audio cards are fixed-size, so only
 * their centre moves.
 */
export function scaledElement(el: CanvasElement, ax: number, ay: number, s: number, measureFor?: (style: TextStyleFields) => Measure): CanvasElement {
  const fx = (x: number) => ax + (x - ax) * s;
  const fy = (y: number) => ay + (y - ay) * s;
  switch (el.type) {
    case "stroke":
      return { ...el, size: el.size * s, points: el.points.map(([x, y, p]) => [fx(x), fy(y), p]) };
    case "image":
      return { ...el, x: fx(el.x), y: fy(el.y), w: el.w * s, h: el.h * s };
    case "audio":
    case "file":
      return { ...el, x: fx(el.x + CARD_W / 2) - CARD_W / 2, y: fy(el.y + CARD_H / 2) - CARD_H / 2 };
    case "text": {
      const next: TextEl = { ...el, x: fx(el.x), y: fy(el.y), fontSize: el.fontSize * s, w: el.w * s };
      if (el.maxW !== undefined) next.maxW = el.maxW * s;
      // Legacy boxes (no autoW) wrap at w and have never stored a line count: leave it that way.
      if (el.autoW === undefined) return next;
      const measure = (measureFor ?? approxMeasureFor)(next);
      return { ...next, ...measureTextBox(measure, next) };
    }
  }
}

export interface SelectionScaleContext {
  scene: Scene;
  history: History;
  selection: Selection;
  zoom: () => number;
  /** Real text measure (the canvas's) for scaled text boxes. Default: the approximation. */
  measureText?: (style: TextStyleFields) => Measure;
  /** A scaled box's measured lines were just stored. */
  onTextMeasured?: (id: string) => void;
}

/** Corner drag on a scalable selection: scales it uniformly about the opposite corner, as one undo step. */
export class SelectionScale {
  private active: {
    before: CanvasElement[];
    anchor: [number, number];
    /** The grabbed corner relative to the anchor at the start. */
    diag: [number, number];
    off: [number, number];
    minS: number;
  } | null = null;
  private s = 1;

  constructor(private ctx: SelectionScaleContext) {}

  /** Starts a scale when (x, y) is on a corner handle of a scalable selection. */
  begin(x: number, y: number): boolean {
    const els = this.ctx.selection.elements();
    if (!isScalable(els)) return false;
    const b = this.ctx.selection.bounds();
    if (!b) return false;
    const zoom = this.ctx.zoom();
    const c = cornerAt(b, x, y, zoom);
    if (!c) return false;
    const [cx, cy] = cornerPoint(b, c);
    const anchor = cornerPoint(b, opposite[c]);
    const diag: [number, number] = [cx - anchor[0], cy - anchor[1]];
    const longest = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    if (longest <= 0) return false;
    this.active = { before: els, anchor, diag, off: [cx - x, cy - y], minS: MIN_SELECTION_PX / zoom / longest };
    this.s = 1;
    return true;
  }

  move(x: number, y: number): void {
    const a = this.active;
    if (!a) return;
    const qx = x + a.off[0] - a.anchor[0];
    const qy = y + a.off[1] - a.anchor[1];
    const [dx, dy] = a.diag;
    // Projection of the pointer onto the box's diagonal: uniform, and smooth whichever way the drag leans.
    const s = Math.max(a.minS, (qx * dx + qy * dy) / (dx * dx + dy * dy));
    if (s === this.s) return;
    this.s = s;
    const [ax, ay] = a.anchor;
    const { scene } = this.ctx;
    scene.batch(() => {
      for (const el of a.before) {
        if (!scene.get(el.id)) continue;
        // A fresh stamp each move (the original's would lose to it under last-write-wins).
        const patch: Partial<CanvasElement> = { ...scaledElement(el, ax, ay, s, this.ctx.measureText) };
        delete patch.updatedAt;
        scene.update(el.id, patch);
      }
    });
    this.ctx.selection.notify();
  }

  /** Ends the drag; pushes one undo step if the size changed. */
  end(): void {
    const a = this.active;
    this.active = null;
    if (!a || this.s === 1) return;
    this.s = 1;
    const before: Change["before"] = [];
    const after: Change["after"] = [];
    for (const el of a.before) {
      const now = this.ctx.scene.get(el.id);
      if (!now) continue;
      before.push(el);
      after.push(now);
    }
    if (after.length === 0) return;
    this.ctx.history.push({ before, after });
    for (const el of after) if (el.type === "text") this.ctx.onTextMeasured?.(el.id);
  }
}
