import { describe, it, expect, vi } from "vitest";
import { Scene } from "./scene";
import { boundsOf, CARD_W, CARD_H } from "./bounds";
import type { CanvasElement, ImageEl, StrokeEl, TextEl, AudioEl } from "./types";

const img = (id: string, x: number, y: number, z = 0): ImageEl => ({
  id, z, updatedAt: 1, type: "image", x, y, w: 100, h: 100, assetPath: "a.png",
});
const stroke = (id: string, x: number, y: number, z = 0): StrokeEl => ({
  id, z, updatedAt: 1, type: "stroke", tool: "pen", color: "#000", size: 4,
  points: [[x, y, 0.5], [x + 10, y + 10, 0.5]], simulatePressure: false,
});
const view = { minX: 0, minY: 0, maxX: 500, maxY: 500 };

describe("boundsOf", () => {
  it("pads strokes by size/2", () => {
    expect(boundsOf(stroke("s", 10, 20))).toEqual({ minX: 8, minY: 18, maxX: 22, maxY: 32 });
  });
  it("pads highlighter strokes by 1.5x size", () => {
    const h: StrokeEl = { ...stroke("h", 10, 20), tool: "highlighter" };
    expect(boundsOf(h)).toEqual({ minX: 4, minY: 14, maxX: 26, maxY: 36 });
  });
  it("uses card size for audio/file", () => {
    const a: AudioEl = { id: "a", z: 0, updatedAt: 1, type: "audio", x: 5, y: 6, assetPath: "p", durationMs: 1 };
    expect(boundsOf(a)).toEqual({ minX: 5, minY: 6, maxX: 5 + CARD_W, maxY: 6 + CARD_H });
  });
  it("text height is fontSize*1.4*lines", () => {
    const t: TextEl = { id: "t", z: 0, updatedAt: 1, type: "text", x: 0, y: 0, w: 100, text: "a\nb", fontSize: 10, color: "#000" };
    expect(boundsOf(t)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 28 });
  });
});

describe("Scene", () => {
  it("getVisible returns elements only when bounds intersect (touching counts)", () => {
    const s = new Scene();
    s.add(img("in", 100, 100));
    s.add(img("out", 1000, 1000));
    s.add(img("touch", 500, 500));
    expect(s.getVisible(view).map((e) => e.id).sort()).toEqual(["in", "touch"]);
  });
  it("update moves it in the index", () => {
    const s = new Scene();
    s.add(img("a", 100, 100));
    s.update("a", { x: 2000, y: 2000 } as Partial<CanvasElement>);
    expect(s.getVisible(view)).toEqual([]);
    expect(s.getVisible({ minX: 1900, minY: 1900, maxX: 2200, maxY: 2200 })).toHaveLength(1);
  });
  it("update bumps updatedAt and cannot change id/type", () => {
    const s = new Scene();
    s.add(img("a", 0, 0));
    s.update("a", { id: "zzz", type: "text", x: 5 } as Partial<CanvasElement>);
    const el = s.get("a")!;
    expect(el.id).toBe("a");
    expect(el.type).toBe("image");
    expect(el.updatedAt).toBeGreaterThan(1);
    expect(s.get("zzz")).toBeUndefined();
    s.update("a", { updatedAt: 42 });
    expect(s.get("a")!.updatedAt).toBe(42);
  });
  it("updatedAt strictly increases even with a fixed clock or a future stamp", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      const s = new Scene();
      s.add({ ...img("a", 0, 0), updatedAt: 500 });
      s.update("a", { x: 1 } as Partial<CanvasElement>);
      const t1 = s.get("a")!.updatedAt;
      s.update("a", { x: 2 } as Partial<CanvasElement>);
      const t2 = s.get("a")!.updatedAt;
      expect(t1).toBe(1000);
      expect(t2).toBeGreaterThan(t1);
      s.add({ ...img("f", 0, 0), updatedAt: 5000 });
      s.update("f", { x: 1 } as Partial<CanvasElement>);
      expect(s.get("f")!.updatedAt).toBeGreaterThan(5000);
    } finally {
      vi.restoreAllMocks();
    }
  });
  it("remove reports id in takeDirty deletes", () => {
    const s = new Scene([img("a", 0, 0)]);
    s.takeDirty();
    s.remove("a");
    expect(s.get("a")).toBeUndefined();
    expect(s.getVisible(view)).toEqual([]);
    expect(s.takeDirty()).toEqual({ upserts: [], deletes: [{ id: "a", updatedAt: expect.any(Number) }] });
  });
  it("add then remove before takeDirty appears only in deletes", () => {
    const s = new Scene();
    s.add(img("a", 0, 0));
    s.remove("a");
    expect(s.takeDirty()).toEqual({ upserts: [], deletes: [{ id: "a", updatedAt: expect.any(Number) }] });
  });
  it("tombstone stamps exceed the element's stamp and re-adding beats its own tombstone", () => {
    const s = new Scene([{ ...img("a", 0, 0), updatedAt: Date.now() + 50_000 }]);
    const old = s.get("a")!;
    s.remove("a");
    const [d] = s.takeDirty().deletes;
    expect(d.updatedAt).toBeGreaterThan(old.updatedAt);
    s.add(old);
    expect(s.get("a")!.updatedAt).toBeGreaterThan(d.updatedAt);
    expect(s.takeDirty().deletes).toEqual([]);
  });
  it("takeDirty returns each changed element once, then is empty", () => {
    const s = new Scene();
    s.add(img("a", 0, 0));
    s.update("a", { x: 1 } as Partial<CanvasElement>);
    s.update("a", { x: 2 } as Partial<CanvasElement>);
    const d = s.takeDirty();
    expect(d.upserts).toHaveLength(1);
    expect((d.upserts[0] as ImageEl).x).toBe(2);
    expect(d.deletes).toEqual([]);
    expect(s.takeDirty()).toEqual({ upserts: [], deletes: [] });
  });
  it("constructor elements are not dirty", () => {
    expect(new Scene([img("a", 0, 0)]).takeDirty()).toEqual({ upserts: [], deletes: [] });
  });
  it("all() is z-ordered and nextZ exceeds max", () => {
    const s = new Scene();
    s.add(img("c", 0, 0, 3));
    s.add(img("a", 0, 0, 1));
    s.add(img("b", 0, 0, 2));
    expect(s.all().map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(s.nextZ()).toBe(4);
    expect(new Scene().nextZ()).toBe(0);
  });
  it("getVisible is sorted by z", () => {
    const s = new Scene();
    s.add(img("c", 0, 0, 3));
    s.add(img("a", 0, 0, 1));
    expect(s.getVisible(view).map((e) => e.id)).toEqual(["a", "c"]);
  });
  it("onChange fires on mutations and can unsubscribe", () => {
    const s = new Scene();
    const fn = vi.fn();
    const off = s.onChange(fn);
    s.add(img("a", 0, 0));
    s.update("a", { x: 1 } as Partial<CanvasElement>);
    s.remove("a");
    expect(fn).toHaveBeenCalledTimes(3);
    off();
    s.add(img("b", 0, 0));
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("getVisible over 10k elements under 5 ms", () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const s = new Scene();
    for (let i = 0; i < 10_000; i++) s.add(stroke(`s${i}`, rnd() * 10_000, rnd() * 10_000, i));
    const v = { minX: 1000, minY: 1000, maxX: 2400, maxY: 2400 }; // ~2% of area
    for (let i = 0; i < 10; i++) s.getVisible(v); // warm up
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      const r = s.getVisible(v);
      times.push(performance.now() - t0);
      expect(r.length).toBeGreaterThan(50);
    }
    times.sort((a, b) => a - b);
    expect(times[10]).toBeLessThan(5);
  });
});
