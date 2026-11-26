/** Width in world units of `s` set at `fontSize`. */
export type Measure = (s: string, fontSize: number) => number;

/** Average glyph advance for sans-serif, as a share of the font size (slightly generous). */
export const APPROX_CHAR_WIDTH = 0.55;

/** Average glyph advance per font, as a share of the font size (slightly generous, like the sans default). */
const APPROX_BY_FONT = { sans: APPROX_CHAR_WIDTH, serif: 0.56, hand: 0.5, mono: 0.62 } as const;

/** Context-free measure for a styled box. A legacy box (no `font`) measures exactly as before. */
export function approxMeasureFor(style: { font?: keyof typeof APPROX_BY_FONT; bold?: boolean }): Measure {
  if (!style.font) return approxMeasure;
  const k = APPROX_BY_FONT[style.font] * (style.bold ? 1.06 : 1);
  return (s, fontSize) => s.length * k * fontSize;
}

/** Context-free measure: used by bounds, and by the renderer when no 2D context can measure. */
export const approxMeasure: Measure = (s, fontSize) => s.length * APPROX_CHAR_WIDTH * fontSize;

/**
 * Greedy word wrap to `w`. Explicit "\n" always breaks; a word wider than `w` is split by characters.
 * The renderer and bounds share this so selection boxes follow the drawn text.
 */
export function wrapText(measure: Measure, text: string, w: number, fontSize: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (para === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.match(/\S+\s*|\s+/g) ?? []) {
      const trial = line + word;
      if (line === "" || measure(trial.trimEnd(), fontSize) <= w) {
        line = trial;
        if (measure(line.trimEnd(), fontSize) <= w) continue;
      } else {
        out.push(line.trimEnd());
        line = word;
        if (measure(line.trimEnd(), fontSize) <= w) continue;
      }
      // `line` is a single over-wide word: break it by characters.
      let chunk = "";
      for (const ch of line.trimEnd()) {
        if (chunk !== "" && measure(chunk + ch, fontSize) > w) {
          out.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    }
    out.push(line.trimEnd());
  }
  return out;
}
