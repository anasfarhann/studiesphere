import type { Change, History } from "../model/history";
import type { Scene } from "../model/scene";
import type { ImageEl } from "../model/types";

/** A rectangle in source-image fractions (0-1). */
export type CropRect = { x: number; y: number; w: number; h: number };
/** A rectangle in world units. */
export type WorldRect = { x: number; y: number; w: number; h: number };
export type CropHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Smallest crop per axis, as a share of the source. */
export const MIN_CROP = 0.05;
/** Touch target of a crop handle in screen pixels. */
export const CROP_HANDLE_HIT_PX = 44;

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The crop when it is well-formed (inside the source, at least the minimum size), else null. */
export function validCrop(c: unknown): CropRect | null {
  if (typeof c !== "object" || c === null) return null;
  const { x, y, w, h } = c as Record<string, unknown>;
  if (!fin(x) || !fin(y) || !fin(w) || !fin(h)) return null;
  const e = 1e-9;
  if (x < -e || y < -e || w < MIN_CROP - e || h < MIN_CROP - e || x + w > 1 + e || y + h > 1 + e) return null;
  return { x, y, w, h };
}

export function isFullCrop(c: CropRect): boolean {
  const e = 1e-6;
  return c.x <= e && c.y <= e && c.w >= 1 - e && c.h >= 1 - e;
}

/** The whole source image in world units, given the element showing (a part of) it. */
export function fullFrame(el: ImageEl): WorldRect {
  const c = validCrop(el.crop);
  if (!c) return { x: el.x, y: el.y, w: el.w, h: el.h };
  const w = el.w / c.w;
  const h = el.h / c.h;
  return { x: el.x - c.x * w, y: el.y - c.y * h, w, h };
}

/** World rectangle a crop shows, within the full frame. */
export function cropToWorld(frame: WorldRect, c: CropRect): WorldRect {
  return { x: frame.x + c.x * frame.w, y: frame.y + c.y * frame.h, w: c.w * frame.w, h: c.h * frame.h };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Moves the handle's edge(s) by (dx, dy) source fractions, staying in the source and above the minimum. */
export function dragCrop(start: CropRect, handle: CropHandle, dx: number, dy: number): CropRect {
  let { x, y, w, h } = start;
  if (handle.includes("w")) {
    const nx = clamp(start.x + dx, 0, start.x + start.w - MIN_CROP);
    w = start.x + start.w - nx;
    x = nx;
  } else if (handle.includes("e")) {
    w = clamp(start.w + dx, MIN_CROP, 1 - start.x);
  }
  if (handle.includes("n")) {
    const ny = clamp(start.y + dy, 0, start.y + start.h - MIN_CROP);
    h = start.y + start.h - ny;
    y = ny;
  } else if (handle.includes("s")) {
    h = clamp(start.h + dy, MIN_CROP, 1 - start.y);
  }
  return { x, y, w, h };
}

/** The element showing `crop` of its image, with x/y/w/h set so the visible region stays where it is drawn. */
export function applyCrop(el: ImageEl, crop: CropRect): ImageEl {
  const r = cropToWorld(fullFrame(el), crop);
  const next: ImageEl = { ...el, x: r.x, y: r.y, w: r.w, h: r.h };
  if (isFullCrop(crop)) delete next.crop;
  else next.crop = { ...crop };
  return next;
}

/** The element showing its whole image at the scale it has now. */
export function resetCrop(el: ImageEl): ImageEl {
  return applyCrop(el, FULL_CROP);
}

/** History merges `before`/`after` over the live element, so a missing crop must be named (as undefined). */
function named(el: ImageEl): ImageEl {
  return "crop" in el ? el : { ...el, crop: undefined };
}

export interface ImageCropContext {
  scene: Scene;
  history: History;
  /** Shows the element as given (or, with null, as it is) on the canvas without touching the scene. */
  preview: (p: (WorldRect & { id: string; crop?: undefined }) | null) => void;
  /** Called whenever the session state changes (overlay redraw). */
  onChange: () => void;
}

export interface CropState {
  id: string;
  /** The whole source image, in world units. */
  frame: WorldRect;
  draft: CropRect;
}

/**
 * Crop mode for one photo. The scene is untouched until {@link done}, which is one undo step; cancel
 * leaves everything as it was. While open the canvas shows the whole source (via preview) so the crop can grow too.
 */
export class ImageCrop {
  private session: { before: ImageEl; frame: WorldRect; draft: CropRect } | null = null;
  private drag: { handle: CropHandle; pointerId: number; start: CropRect; x: number; y: number } | null = null;

  constructor(private ctx: ImageCropContext) {}

  get active(): boolean {
    return this.session !== null;
  }

  get id(): string | null {
    return this.session?.before.id ?? null;
  }

  state(): CropState | null {
    const s = this.session;
    return s ? { id: s.before.id, frame: s.frame, draft: s.draft } : null;
  }

  begin(id: string): boolean {
    if (this.session) return false;
    const el = this.ctx.scene.get(id);
    if (!el || el.type !== "image") return false;
    const frame = fullFrame(el);
    this.session = { before: el, frame, draft: validCrop(el.crop) ?? { ...FULL_CROP } };
    this.ctx.preview({ id, ...frame });
    this.ctx.onChange();
    return true;
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  /** Starts a handle drag at world point (x, y). One drag at a time (a second pointer is ignored). */
  beginDrag(handle: CropHandle, pointerId: number, x: number, y: number): boolean {
    if (!this.session || this.drag) return false;
    this.drag = { handle, pointerId, start: this.session.draft, x, y };
    return true;
  }

  moveDrag(pointerId: number, x: number, y: number): void {
    const s = this.session;
    const d = this.drag;
    if (!s || !d || d.pointerId !== pointerId) return;
    s.draft = dragCrop(d.start, d.handle, (x - d.x) / s.frame.w, (y - d.y) / s.frame.h);
    this.ctx.onChange();
  }

  endDrag(pointerId: number): void {
    if (this.drag?.pointerId === pointerId) this.drag = null;
  }

  /** The draft becomes the whole image again; Done then removes the crop. */
  reset(): void {
    const s = this.session;
    if (!s) return;
    this.drag = null;
    s.draft = { ...FULL_CROP };
    this.ctx.onChange();
  }

  /** Commits the draft as one undo step (nothing when it equals what the image already had). */
  done(): void {
    const s = this.session;
    if (!s) return;
    const live = this.ctx.scene.get(s.before.id);
    this.close();
    if (!live || live.type !== "image") return;
    const next = applyCrop(live, s.draft);
    const same =
      next.x === live.x && next.y === live.y && next.w === live.w && next.h === live.h &&
      JSON.stringify(next.crop ?? null) === JSON.stringify(live.crop ?? null);
    if (same) return;
    const { updatedAt: _u, ...patch } = next;
    void _u;
    this.ctx.scene.update(live.id, { ...patch, crop: next.crop });
    const after = this.ctx.scene.get(live.id) as ImageEl;
    const c: Change = { before: [named(live)], after: [named(after)] };
    this.ctx.history.push(c);
  }

  /** Leaves the image untouched. */
  cancel(): void {
    if (!this.session) return;
    this.close();
  }

  private close(): void {
    this.session = null;
    this.drag = null;
    this.ctx.preview(null);
    this.ctx.onChange();
  }
}
