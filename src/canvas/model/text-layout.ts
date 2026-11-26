import type { TextEl } from "./types";
import { wrapText, type Measure } from "./wrap-text";

/** An auto-width box never grows wider than this (world units); longer lines wrap at it. */
export const AUTO_TEXT_MAX_W = 560;
/** A resized (fixed-width) box is at most this wide. */
export const TEXT_MAX_W = 2000;
/** Room after the longest line (as a share of the font size), so the caret fits while typing. */
export const AUTO_TEXT_PAD_EM = 0.3;

/** Narrowest a text box gets, auto or resized: about two em, so an empty box still shows a caret area. */
export function minTextWidth(fontSize: number): number {
  return fontSize * 2;
}

/** Width of an auto box holding `text`: its longest line (explicit newlines kept) plus padding, clamped. */
export function autoTextWidth(measure: Measure, text: string, fontSize: number): number {
  let longest = 0;
  for (const line of text.split("\n")) longest = Math.max(longest, measure(line, fontSize));
  const w = Math.ceil(longest + fontSize * AUTO_TEXT_PAD_EM);
  return Math.min(AUTO_TEXT_MAX_W, Math.max(minTextWidth(fontSize), w));
}

/** The width a box wraps at: computed from its text for an auto box, its stored `w` otherwise (legacy and resized). */
export function layoutWidth(measure: Measure, el: Pick<TextEl, "w" | "text" | "fontSize" | "autoW">): number {
  return el.autoW ? autoTextWidth(measure, el.text, el.fontSize) : el.w;
}

/** The lines a box is drawn as. */
export function textLines(measure: Measure, el: Pick<TextEl, "w" | "text" | "fontSize" | "autoW">): string[] {
  return wrapText(measure, el.text, layoutWidth(measure, el), el.fontSize);
}

/** Clamp for a resized box's width. */
export function clampTextWidth(w: number, fontSize: number): number {
  return Math.min(TEXT_MAX_W, Math.max(minTextWidth(fontSize), w));
}
