import { describe, expect, it } from "vitest";
import { clampSize, DEFAULT_SETTINGS, loadSettings, saveSettings, SIZE_RANGE } from "./tool-settings";

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
});
