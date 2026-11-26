import type { TextFont } from "../settings/tool-settings";

/** The style fields of a text box; every one is optional on a stored element. */
export type TextStyleFields = { font?: TextFont; bold?: boolean; italic?: boolean; underline?: boolean };

export const TEXT_FONTS: readonly TextFont[] = ["sans", "serif", "hand", "mono"];

/** CSS font-family per font. All four are self-hosted (@fontsource, imported in the root layout). */
export const FONT_FAMILY: Record<TextFont, string> = {
  sans: '"DM Sans Variable", sans-serif',
  serif: "Lora, serif",
  hand: "Caveat, cursive",
  mono: '"JetBrains Mono", monospace',
};

/** Family for a stored element. A legacy element (no `font`) keeps the plain system sans it was always drawn in. */
export function fontFamily(style: TextStyleFields): string {
  return style.font ? FONT_FAMILY[style.font] : "sans-serif";
}

/**
 * Canvas/CSS font shorthand for `size` px of `style`. A legacy element without the new fields
 * gives exactly `${size}px sans-serif`, as before.
 */
export function cssFont(style: TextStyleFields, size: number): string {
  return `${style.italic ? "italic " : ""}${style.bold ? "bold " : ""}${size}px ${fontFamily(style)}`;
}

/** Starts loading the face for `font` if it is not loaded yet; `onReady` runs once it is (never when already loaded). */
export function whenFontReady(font: string, onReady: () => void): void {
  if (typeof document === "undefined" || !document.fonts || typeof document.fonts.load !== "function") return;
  try {
    if (document.fonts.check(font)) return;
    void document.fonts.load(font).then(onReady, () => {});
  } catch {
    // A font shorthand the browser rejects: keep the fallback face.
  }
}
