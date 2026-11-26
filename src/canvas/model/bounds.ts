import { strokeWidth } from "./stroke-style";
import type { CanvasElement, Rect } from "./types";
import { autoMaxWidth } from "./text-layout";
import { approxMeasureFor, wrapText } from "./wrap-text";

/** Fixed card size (world units) for audio and file elements. */
export const CARD_W = 240;
export const CARD_H = 64;
/** Audio card: the play icon's centre (from the card's left edge, vertically centred) and radius. */
export const AUDIO_ICON_X = 32;
export const AUDIO_ICON_R = 20;
/** File card: the type badge's centre (from the card's left edge, vertically centred) and side; also the tap target. */
export const FILE_ICON_X = 30;
export const FILE_ICON_SIZE = 44;
/** Line height as a multiple of fontSize; the renderer and the text overlay use it too. */
export const TEXT_LINE_HEIGHT = 1.4;

export function boundsOf(el: CanvasElement): Rect {
  switch (el.type) {
    case "stroke": {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [x, y] of el.points) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      // Ink radius at the drawn width (legacy highlighters are 3x wide, see strokeWidth).
      const pad = strokeWidth(el) / 2;
      return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    }
    case "text": {
      // No canvas context here: approximate widths (a touch wide, so boxes err on the tall side).
      // An auto box's `w` was measured for real when it was committed: below the maximum it does not wrap, so
      // only its explicit lines count (an approximate re-wrap would add phantom lines).
      // A stored, really measured line count wins.
      const lines =
        el.lines !== undefined && Number.isFinite(el.lines) && el.lines >= 1
          ? el.lines
          : el.autoW && el.w < autoMaxWidth(el.fontSize, el.maxW)
            ? el.text.split("\n").length
            : wrapText(approxMeasureFor(el), el.text, el.w, el.fontSize).length;
      return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.fontSize * TEXT_LINE_HEIGHT * lines };
    }
    case "image":
      return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h };
    case "audio":
    case "file":
      return { minX: el.x, minY: el.y, maxX: el.x + CARD_W, maxY: el.y + CARD_H };
  }
}
