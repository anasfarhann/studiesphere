import type { StrokeEl } from "./types";

/** Highlighter ink opacity (renderer, size preview). */
export const HIGHLIGHTER_ALPHA = 0.35;

/** Legacy highlighters (no `sizeMode`) were drawn at this multiple of their stored size. */
export const LEGACY_HIGHLIGHTER_SCALE = 3;

/**
 * Drawn ink width (world units) of a stroke. New highlighters carry `sizeMode: "px"` and draw at exactly
 * `size`; older ones keep their 3x width so saved notes look unchanged.
 */
export function strokeWidth(el: Pick<StrokeEl, "tool" | "size" | "sizeMode">): number {
  return el.tool === "highlighter" && el.sizeMode !== "px" ? el.size * LEGACY_HIGHLIGHTER_SCALE : el.size;
}
