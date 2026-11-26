import { boundsOf } from "../model/bounds";
import type { History } from "../model/history";
import type { Scene } from "../model/scene";
import { clampTextWidth } from "../model/text-layout";
import type { Rect, TextEl } from "../model/types";
import type { Selection } from "../selection";

/** Touch target of the right-edge handle in screen pixels (drawn as the photo handle, HANDLE_DRAW_PX). */
export const TEXT_HANDLE_HIT_PX = 44;

export interface TextResizeContext {
  scene: Scene;
  history: History;
  selection: Selection;
  zoom: () => number;
}

/** The selected text box when it is the only selected element. */
export function singleSelectedText(scene: Scene, selection: Selection): TextEl | null {
  if (selection.ids.length !== 1) return null;
  const el = scene.get(selection.ids[0]);
  return el && el.type === "text" ? el : null;
}

/** Centre of the handle on a box's right edge (world). */
export function textHandleCenter(b: Rect): [number, number] {
  return [b.maxX, (b.minY + b.maxY) / 2];
}

/**
 * Whether (x, y) is on the handle. The hit area is 44 screen px wide but reaches at most a quarter of the box's
 * width inside it, so a short word can still be moved by dragging inside it.
 */
export function onTextHandle(b: Rect, x: number, y: number, zoom: number): boolean {
  const [cx, cy] = textHandleCenter(b);
  const full = TEXT_HANDLE_HIT_PX / zoom;
  const inside = Math.min(full / 2, (b.maxX - b.minX) / 4);
  const reachY = Math.max(full / 2, (b.maxY - b.minY) / 2);
  return x >= cx - inside && x <= cx + full - inside && Math.abs(y - cy) <= reachY;
}

/** Right-edge drag on a selected text box: sets a fixed width the text wraps inside; the height follows. */
export class TextResize {
  private active: { before: TextEl; offX: number } | null = null;
  private changed = false;

  constructor(private ctx: TextResizeContext) {}

  /** Starts a resize when (x, y) is on the handle of the single selected text box. */
  begin(x: number, y: number): boolean {
    const el = singleSelectedText(this.ctx.scene, this.ctx.selection);
    if (!el) return false;
    const b = boundsOf(el);
    if (!onTextHandle(b, x, y, this.ctx.zoom())) return false;
    this.active = { before: el, offX: b.maxX - x };
    this.changed = false;
    return true;
  }

  move(x: number): void {
    const a = this.active;
    if (!a) return;
    const { before } = a;
    const w = clampTextWidth(x + a.offX - before.x, before.fontSize);
    const cur = this.ctx.scene.get(before.id);
    if (!cur || cur.type !== "text" || (cur.w === w && cur.autoW === false)) return;
    this.ctx.scene.update(before.id, { w, autoW: false } satisfies Partial<TextEl>);
    this.changed = true;
    this.ctx.selection.prune();
  }

  /** Ends the drag; pushes one undo step if the width changed. */
  end(): void {
    const a = this.active;
    this.active = null;
    if (!a || !this.changed) return;
    const after = this.ctx.scene.get(a.before.id);
    if (after) this.ctx.history.push({ before: [a.before], after: [after] });
  }
}
