import { elementAt } from "../selection";
import type { Scene } from "../model/scene";
import type { ImageEl } from "../model/types";
import { validCrop } from "./image-crop";

/** A photo that is decoded and ready, and whether reading its pixels would throw (see isTaintedImage). */
export type SampleSource = { img: CanvasImageSource & { width: number; height: number }; tainted: boolean };

export type PickResult =
  /** The colour (`#rrggbb`, lowercase for pixels) of the topmost element under the point. */
  | { kind: "color"; hex: string }
  /** The element under the point is a photo whose pixels can't be read. */
  | { kind: "unreadable" }
  /** Nothing with a colour under the point (empty page, a card, a photo still loading, a transparent pixel). */
  | { kind: "none" };

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex2 = (n: number) => n.toString(16).padStart(2, "0");

/** The photo's pixel under world point (x, y), honouring its crop; null outside it or when transparent. */
function samplePixel(el: ImageEl, x: number, y: number, src: SampleSource, makeCanvas: () => HTMLCanvasElement): string | null {
  if (el.w <= 0 || el.h <= 0) return null;
  const u = Math.min(1, Math.max(0, (x - el.x) / el.w));
  const v = Math.min(1, Math.max(0, (y - el.y) / el.h));
  const crop = validCrop(el.crop) ?? { x: 0, y: 0, w: 1, h: 1 };
  const iw = src.img.width;
  const ih = src.img.height;
  const sx = Math.min(iw - 1, Math.max(0, Math.floor((crop.x + u * crop.w) * iw)));
  const sy = Math.min(ih - 1, Math.max(0, Math.floor((crop.y + v * crop.h) * ih)));
  const c = makeCanvas();
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src.img, sx, sy, 1, 1, 0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  if (d[3] < 8) return null;
  return `#${hex2(d[0])}${hex2(d[1])}${hex2(d[2])}`;
}

/**
 * The colour of the topmost element under world point (x, y): a stroke's or text box's own colour, or the photo's
 * pixel there (read through a 1x1 offscreen canvas at source coordinates). Runs once per pick, never per move.
 */
export function pickColorAt(o: {
  scene: Scene;
  x: number;
  y: number;
  /** Hit slop in world units. */
  reach: number;
  image: (assetPath: string) => SampleSource | null;
  makeCanvas?: () => HTMLCanvasElement;
}): PickResult {
  const id = elementAt(o.scene, o.x, o.y, o.reach);
  const el = id ? o.scene.get(id) : undefined;
  if (!el) return { kind: "none" };
  if (el.type === "stroke" || el.type === "text") return HEX.test(el.color) ? { kind: "color", hex: el.color } : { kind: "none" };
  if (el.type !== "image") return { kind: "none" };
  const src = o.image(el.assetPath);
  if (!src) return { kind: "none" };
  if (src.tainted) return { kind: "unreadable" };
  try {
    const hex = samplePixel(el, o.x, o.y, src, o.makeCanvas ?? (() => document.createElement("canvas")));
    return hex ? { kind: "color", hex } : { kind: "none" };
  } catch {
    // A canvas that turned out to be tainted after all: reading it throws a SecurityError.
    return { kind: "unreadable" };
  }
}
