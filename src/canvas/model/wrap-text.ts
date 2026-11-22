/** Width in world units of `s` set at `fontSize`. */
export type Measure = (s: string, fontSize: number) => number;

/** Average glyph advance for sans-serif, as a share of the font size (slightly generous). */
export const APPROX_CHAR_WIDTH = 0.55;

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
    for (const word of para.split(/(?<= )/)) {
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
