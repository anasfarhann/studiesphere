import { boundsOf } from "../model/bounds";
import type { CanvasElement, Rect } from "../model/types";
import { Camera } from "../view/camera";

/** Card previews (see the plan's Global Constraints): at most 480 px wide, JPEG at quality 0.7. */
export const PREVIEW_MAX_W = 480;
/** A tall page keeps its top: cards show the top of the preview anyway. */
export const PREVIEW_MAX_H = 640;
/** At least 4:3 landscape, so a single line of writing is not a thin strip that `object-cover` blows up. */
export const PREVIEW_MIN_H = Math.round(PREVIEW_MAX_W * 0.75);
export const PREVIEW_QUALITY = 0.7;
/** Margin around the content's bounding box, in world units (or 4% of its longer side, if larger). */
export const PREVIEW_MARGIN = 24;
/** A small scribble is magnified at most 2x. */
export const PREVIEW_MAX_SCALE = 2;

/** World origin and scale of the preview, and its pixel size. */
export interface PreviewFrame {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}

/** Frames the bounding box of `rects` with a small margin; null for an empty page. */
export function previewFrame(rects: Rect[]): PreviewFrame | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    if (r.minX < minX) minX = r.minX;
    if (r.minY < minY) minY = r.minY;
    if (r.maxX > maxX) maxX = r.maxX;
    if (r.maxY > maxY) maxY = r.maxY;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
  const w = maxX - minX;
  const h = maxY - minY;
  const m = Math.max(PREVIEW_MARGIN, Math.max(w, h) * 0.04);
  const fw = Math.max(w + 2 * m, PREVIEW_MAX_W / PREVIEW_MAX_SCALE);
  const scale = PREVIEW_MAX_W / fw;
  const height = Math.min(PREVIEW_MAX_H, Math.max(PREVIEW_MIN_H, Math.round((h + 2 * m) * scale)));
  return { x: minX - m, y: minY - m, scale, width: PREVIEW_MAX_W, height };
}

/** What a preview is drawn from: the live editor (its renderer's drawing code and caches). */
export interface PreviewTarget {
  elements(): CanvasElement[];
  /** Draws the scene onto `ctx` through `camera` at w x h px; false when the renderer is gone. */
  drawSnapshot(ctx: CanvasRenderingContext2D, camera: Camera, w: number, h: number): boolean;
  /** Waits (bounded) until the page's photos are decoded, so the preview shows them rather than grey boxes. */
  preloadImages?(): Promise<void>;
}

const newCanvas = () => document.createElement("canvas");

/** Draws the page onto a fresh offscreen canvas, synchronously; null for an empty page or a destroyed renderer. */
export function capturePreview(target: PreviewTarget, createCanvas: () => HTMLCanvasElement = newCanvas): HTMLCanvasElement | null {
  const frame = previewFrame(target.elements().map(boundsOf));
  if (!frame) return null;
  const canvas = createCanvas();
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const camera = new Camera(frame.x, frame.y, frame.scale);
  return target.drawSnapshot(ctx, camera, frame.width, frame.height) ? canvas : null;
}

/** JPEG at quality 0.7; null when the browser cannot encode. Never throws. */
export function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/jpeg", PREVIEW_QUALITY);
    } catch {
      resolve(null);
    }
  });
}
