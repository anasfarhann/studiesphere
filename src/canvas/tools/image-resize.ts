import type { Change, History } from "../model/history";
import type { Scene } from "../model/scene";
import type { ImageEl } from "../model/types";
import type { Selection } from "../selection";

/** Touch target of the corner handle in screen pixels (drawn smaller, see HANDLE_DRAW_PX). */
export const HANDLE_HIT_PX = 44;
export const HANDLE_DRAW_PX = 14;
const MIN_W = 24;

export interface ImageResizeContext {
  scene: Scene;
  history: History;
  selection: Selection;
  zoom: () => number;
  /** Whether the handle is showing (the menu's Resize); always, when omitted. */
  resizeEnabled?: () => boolean;
}

/** The selected image when it is the only selected element. */
export function singleSelectedImage(scene: Scene, selection: Selection): ImageEl | null {
  if (selection.ids.length !== 1) return null;
  const el = scene.get(selection.ids[0]);
  return el && el.type === "image" ? el : null;
}

/** Bottom-right corner drag on a selected photo; the aspect ratio is locked. */
export class ImageResize {
  private active: { before: ImageEl; offX: number; offY: number } | null = null;
  private changed = false;

  constructor(private ctx: ImageResizeContext) {}

  /** Starts a resize when (x, y) is on the handle of the single selected image. */
  begin(x: number, y: number): boolean {
    if (this.ctx.resizeEnabled && !this.ctx.resizeEnabled()) return false;
    const el = singleSelectedImage(this.ctx.scene, this.ctx.selection);
    if (!el) return false;
    const reach = HANDLE_HIT_PX / 2 / this.ctx.zoom();
    const cx = el.x + el.w;
    const cy = el.y + el.h;
    if (Math.abs(x - cx) > reach || Math.abs(y - cy) > reach) return false;
    this.active = { before: el, offX: cx - x, offY: cy - y };
    this.changed = false;
    return true;
  }

  get resizing(): boolean {
    return this.active !== null;
  }

  move(x: number, y: number): void {
    const a = this.active;
    if (!a) return;
    const { before } = a;
    const sx = (x + a.offX - before.x) / before.w;
    const sy = (y + a.offY - before.y) / before.h;
    const w = Math.max(MIN_W, before.w * Math.max(sx, sy));
    const h = (w * before.h) / before.w;
    this.ctx.scene.update(before.id, { w, h });
    this.changed = true;
    this.ctx.selection.prune();
  }

  /** Ends the drag; pushes one undo step if the size changed. */
  end(): void {
    const a = this.active;
    this.active = null;
    if (!a || !this.changed) return;
    const after = this.ctx.scene.get(a.before.id);
    if (after) {
      const c: Change = { before: [a.before], after: [after] };
      this.ctx.history.push(c);
    }
  }
}
