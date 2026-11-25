import { describe, expect, it } from "vitest";
import { addPreset, clampSize, DEFAULT_SETTINGS, loadSettings, normalizeSettings, removePreset, saveSettings, SIZE_RANGE } from "./tool-settings";

const store = (v: string | null) => ({ getItem: () => v });

describe("tool settings", () => {
  it("has the specified defaults", () => {
    expect(DEFAULT_SETTINGS.pen).toMatchObject({ size: 3, color: "#1B1A1F", presets: ["#1B1A1F", "#2563EB", "#DC2626"] });
    expect(DEFAULT_SETTINGS.highlighter).toMatchObject({ size: 18, color: "#F4D35E", presets: ["#F4D35E", "#8BE0A4", "#F6A5C0"] });
    expect(DEFAULT_SETTINGS.eraser).toMatchObject({ size: 20, mode: "stroke" });
    expect(DEFAULT_SETTINGS.text.size).toBe(20);
    expect(SIZE_RANGE).toEqual({ pen: [1, 40], highlighter: [4, 60], eraser: [4, 80], text: [12, 96] });
  });

  it("returns defaults on empty, corrupt or throwing storage", () => {
    expect(loadSettings(store(null))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(store("{nope"))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(store("42"))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ getItem: () => { throw new Error("denied"); } })).toEqual(DEFAULT_SETTINGS);
  });

  it("merges partial stored data over the defaults and rejects invalid fields", () => {
    const s = loadSettings(store(JSON.stringify({ pen: { size: 12 }, eraser: { mode: "bogus", size: 999 }, text: { font: "serif" } })));
    expect(s.pen).toEqual({ ...DEFAULT_SETTINGS.pen, size: 12 });
    expect(s.eraser).toEqual({ size: 80, mode: "stroke" });
    expect(s.text.font).toBe("serif");
    expect(s.highlighter).toEqual(DEFAULT_SETTINGS.highlighter);
  });

  it("round-trips through saveSettings under ss.tools.v1 and survives throwing storage", () => {
    const m = new Map<string, string>();
    const next = { ...DEFAULT_SETTINGS, pen: { ...DEFAULT_SETTINGS.pen, size: 9 } };
    saveSettings(next, { setItem: (k, v) => void m.set(k, v) });
    expect([...m.keys()]).toEqual(["ss.tools.v1"]);
    expect(loadSettings({ getItem: (k) => m.get(k) ?? null }).pen.size).toBe(9);
    expect(() => saveSettings(next, { setItem: () => { throw new Error("full"); } })).not.toThrow();
  });

  it("clampSize respects each tool's range and rounds", () => {
    expect(clampSize("pen", 0)).toBe(1);
    expect(clampSize("pen", 100)).toBe(40);
    expect(clampSize("highlighter", 2)).toBe(4);
    expect(clampSize("eraser", 81)).toBe(80);
    expect(clampSize("text", 20.4)).toBe(20);
    expect(clampSize("text", Number.NaN)).toBe(12);
  });

  it("normalizeSettings clamps sizes, validates colours and enforces preset rules", () => {
    const messy = { ...DEFAULT_SETTINGS, pen: { ...DEFAULT_SETTINGS.pen, size: 999, color: "red", presets: ["#00AA55", "#00aa55", "nope", ...Array.from({ length: 20 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`)] } };
    const s = normalizeSettings(messy);
    expect(s.pen.size).toBe(40);
    expect(s.pen.color).toBe(DEFAULT_SETTINGS.pen.color);
    expect(s.pen.presets.slice(0, 4)).toEqual([...DEFAULT_SETTINGS.pen.presets, "#00AA55"]);
    expect(s.pen.presets).toHaveLength(12);
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, pen: { ...DEFAULT_SETTINGS.pen, presets: [] } }).pen.presets).toEqual(DEFAULT_SETTINGS.pen.presets);
  });

  it("addPreset dedupes and caps at 12; removePreset protects the defaults", () => {
    let s = addPreset(DEFAULT_SETTINGS, "pen", "#00aa55");
    expect(addPreset(s, "pen", "#00AA55").pen.presets).toEqual(s.pen.presets);
    for (let i = 0; i < 20; i++) s = addPreset(s, "pen", `#1000${i.toString(16).padStart(2, "0")}`);
    expect(s.pen.presets).toHaveLength(12);
    expect(removePreset(s, "pen", "#00aa55").pen.presets).not.toContain("#00aa55");
    expect(removePreset(s, "pen", "#2563EB").pen.presets).toContain("#2563EB");
    expect(s.highlighter.presets).toEqual(DEFAULT_SETTINGS.highlighter.presets);
  });
});
