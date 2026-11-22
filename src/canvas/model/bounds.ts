import type { CanvasElement, Rect } from "./types";

/** Fixed card size (world units) for audio and file elements. */
export const CARD_W = 240;
export const CARD_H = 64;
const TEXT_LINE_HEIGHT = 1.4;

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
      const pad = el.size / 2;
      return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    }
    case "text": {
      const lines = el.text.split("\n").length;
      return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.fontSize * TEXT_LINE_HEIGHT * lines };
    }
    case "image":
      return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h };
    case "audio":
    case "file":
      return { minX: el.x, minY: el.y, maxX: el.x + CARD_W, maxY: el.y + CARD_H };
  }
}
