export type StrokeToolId = "pen" | "highlighter";
export type EraserMode = "stroke" | "pixel";
export type TextFont = "sans" | "serif" | "hand" | "mono";

export type ToolSettings = {
  pen: { size: number; color: string; presets: string[]; snap: boolean };
  highlighter: { size: number; color: string; presets: string[]; snap: boolean };
  eraser: { size: number; mode: EraserMode };
  text: { size: number; color: string; font: TextFont; bold: boolean; italic: boolean; underline: boolean };
};

export const STORAGE_KEY = "ss.tools.v1";

/** Screen px at 100% zoom. */
export const SIZE_RANGE: Record<"pen" | "highlighter" | "eraser" | "text", [min: number, max: number]> = {
  pen: [1, 40],
  highlighter: [4, 60],
  eraser: [4, 80],
  text: [12, 96],
};

export const DEFAULT_SETTINGS: ToolSettings = {
  pen: { size: 3, color: "#1B1A1F", presets: ["#1B1A1F", "#2563EB", "#DC2626"], snap: false },
  highlighter: { size: 18, color: "#F4D35E", presets: ["#F4D35E", "#8BE0A4", "#F6A5C0"], snap: false },
  eraser: { size: 20, mode: "pixel" },
  text: { size: 20, color: "#1B1A1F", font: "sans", bold: false, italic: false, underline: false },
};

export function clampSize(tool: keyof typeof SIZE_RANGE, n: number): number {
  const [min, max] = SIZE_RANGE[tool];
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

const MAX_PRESETS = 12;
const FONTS: readonly TextFont[] = ["sans", "serif", "hand", "mono"];
const HEX = /^#[0-9a-fA-F]{6}$/;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (tool: keyof typeof SIZE_RANGE, v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? clampSize(tool, v) : d);
const col = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

function presets(v: unknown, d: string[]): string[] {
  if (!Array.isArray(v)) return [...d];
  // The three defaults are always present and first; others are de-duplicated case-insensitively.
  const seen = new Set(d.map((c) => c.toLowerCase()));
  const rest: string[] = [];
  for (const c of v) {
    if (typeof c !== "string" || !HEX.test(c) || seen.has(c.toLowerCase())) continue;
    seen.add(c.toLowerCase());
    rest.push(c);
  }
  return [...d, ...rest].slice(0, MAX_PRESETS);
}

export const MAX_PRESET_COUNT = MAX_PRESETS;

/** Colour presets of a stroke tool with `hex` appended (ignored when already present or the list is full). */
export function addPreset(s: ToolSettings, tool: StrokeToolId, hex: string): ToolSettings {
  return normalizeSettings({ ...s, [tool]: { ...s[tool], presets: [...s[tool].presets, hex] } });
}

/**
 * Removes a preset; the three defaults are protected. A tool whose colour was the removed one falls back to
 * the first default: for the pen presets that is both the pen and the text (text colours come from them).
 */
export function removePreset(s: ToolSettings, tool: StrokeToolId, hex: string): ToolSettings {
  const gone = hex.toLowerCase();
  const keep = s[tool].presets.filter((c) => c.toLowerCase() !== gone || DEFAULT_SETTINGS[tool].presets.includes(c));
  const fallback = DEFAULT_SETTINGS[tool].presets[0];
  const swap = (c: string) => (c.toLowerCase() === gone && !keep.some((k) => k.toLowerCase() === gone) ? fallback : c);
  const next: ToolSettings = { ...s, [tool]: { ...s[tool], presets: keep, color: swap(s[tool].color) } };
  if (tool === "pen") next.text = { ...s.text, color: swap(s.text.color) };
  return normalizeSettings(next);
}

function stroke(tool: StrokeToolId, v: unknown): ToolSettings[StrokeToolId] {
  const d = DEFAULT_SETTINGS[tool];
  const r = isObj(v) ? v : {};
  return { size: num(tool, r.size, d.size), color: col(r.color, d.color), presets: presets(r.presets, d.presets), snap: bool(r.snap, d.snap) };
}

/** Defaults overlaid with whatever valid fields `j` holds: sizes clamped, colours validated, preset rules enforced. */
export function normalizeSettings(j: unknown): ToolSettings {
  if (!isObj(j)) return structuredClone(DEFAULT_SETTINGS);
  const e = isObj(j.eraser) ? j.eraser : {};
  const x = isObj(j.text) ? j.text : {};
  const dt = DEFAULT_SETTINGS.text;
  return {
    pen: stroke("pen", j.pen),
    highlighter: stroke("highlighter", j.highlighter),
    eraser: { size: num("eraser", e.size, DEFAULT_SETTINGS.eraser.size), mode: e.mode === "pixel" || e.mode === "stroke" ? e.mode : DEFAULT_SETTINGS.eraser.mode },
    text: {
      size: num("text", x.size, dt.size),
      color: col(x.color, dt.color),
      font: FONTS.find((f) => f === x.font) ?? dt.font,
      bold: bool(x.bold, dt.bold),
      italic: bool(x.italic, dt.italic),
      underline: bool(x.underline, dt.underline),
    },
  };
}

/** Defaults overlaid with whatever valid fields storage holds; never throws. */
export function loadSettings(storage?: Pick<Storage, "getItem">): ToolSettings {
  try {
    const s = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    const raw = s?.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(s: ToolSettings, storage?: Pick<Storage, "setItem">): void {
  try {
    const st = storage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
    st?.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private mode or quota: settings simply don't persist.
  }
}
