import { describe, expect, it, vi } from "vitest";
import { History } from "./model/history";
import { Scene } from "./model/scene";
import type { ImageEl, StrokeEl, TextEl } from "./model/types";
import { elementAt, Selection } from "./selection";

const s = (id: string): StrokeEl => ({
  id, type: "stroke", tool: "pen", color: "#000", size: 2, z: 0, updatedAt: 1, simulatePressure: true,
  points: [[0, 0, 0.3], [10, 10, 0.9]],
});
const t: TextEl = { id: "t", type: "text", x: 5, y: 5, w: 50, text: "x", fontSize: 10, color: "#000", z: 1, updatedAt: 1 };

describe("Selection", () => {
  it("bounds() is the union of element bounds, null when empty", () => {
    const scene = new Scene([s("a"), t]);
    const sel = new Selection(scene);
    expect(sel.bounds()).toBeNull();
    sel.set(["a", "t"]);
    expect(sel.bounds()).toEqual({ minX: -1, minY: -1, maxX: 55, maxY: 19 });
  });

  it("moveBy shifts every point (keeping pressure) and is one undo step", () => {
    const scene = new Scene([s("a"), t]);
    const history = new History();
    const sel = new Selection(scene);
    sel.set(["a", "t"]);
    history.push(sel.moveBy(10, 5));
    expect((scene.get("a") as StrokeEl).points).toEqual([[10, 5, 0.3], [20, 15, 0.9]]);
    expect(scene.get("t")).toMatchObject({ x: 15, y: 10 });
    history.undo(scene);
    expect((scene.get("a") as StrokeEl).points).toEqual([[0, 0, 0.3], [10, 10, 0.9]]);
    expect(scene.get("t")).toMatchObject({ x: 5, y: 5 });
    expect(history.canUndo()).toBe(false);
  });

  it("deleteAll removes and undo restores", () => {
    const scene = new Scene([s("a"), s("b")]);
    const history = new History();
    const sel = new Selection(scene);
    sel.set(["a"]);
    history.push(sel.deleteAll());
    expect(scene.get("a")).toBeUndefined();
    expect(scene.get("b")).toBeDefined();
    expect(sel.ids).toEqual([]);
    history.undo(scene);
    expect(scene.get("a")).toBeDefined();
  });

  it("drops ids whose elements were removed and notifies", () => {
    const scene = new Scene([s("a"), s("b")]);
    const sel = new Selection(scene);
    let n = 0;
    sel.onChange(() => n++);
    sel.set(["a", "b"]);
    scene.remove("a");
    sel.prune();
    expect(sel.ids).toEqual(["b"]);
    expect(n).toBe(2);
  });

  it("moving 2,000 selected elements notifies the scene once and stays fast", () => {
    const els: StrokeEl[] = [];
    for (let i = 0; i < 2000; i++) els.push({ ...s(`k${i}`), z: i });
    const scene = new Scene(els);
    const sel = new Selection(scene);
    // Like the editor: selection prunes on every scene change (O(k) each).
    scene.onChange(() => sel.prune());
    const onScene = vi.fn();
    scene.onChange(onScene);
    sel.set(els.map((e) => e.id));
    const t0 = performance.now();
    const c = sel.moveBy(3, 4);
    const ms = performance.now() - t0;
    expect(onScene).toHaveBeenCalledTimes(1);
    expect(c.after).toHaveLength(2000);
    expect((scene.get("k0") as StrokeEl).points[0]).toEqual([3, 4, 0.3]);
    expect(ms).toBeLessThan(50);
  });

  it("deleteAll notifies the scene once", () => {
    const scene = new Scene([s("a"), s("b"), t]);
    const sel = new Selection(scene);
    const onScene = vi.fn();
    scene.onChange(onScene);
    sel.set(["a", "b", "t"]);
    expect(sel.deleteAll().before).toHaveLength(3);
    expect(onScene).toHaveBeenCalledTimes(1);
    expect(scene.all()).toHaveLength(0);
  });
});

describe("elementAt", () => {
  const img: ImageEl = { id: "img", type: "image", x: 0, y: 0, w: 100, h: 100, assetPath: "o/p/i.png", z: 0, updatedAt: 1 };
  const ink: StrokeEl = { ...s("ink"), z: 2, points: [[0, 50, 0.5], [100, 50, 0.5]] };
  const hl: StrokeEl = { ...s("hl"), tool: "highlighter", size: 10, z: 1, points: [[50, 0, 0.5], [50, 100, 0.5]] };

  it("returns the topmost element whose hit area contains the point", () => {
    const scene = new Scene([img, ink, hl]);
    expect(elementAt(scene, 50, 50, 8)).toBe("ink");
    expect(elementAt(scene, 50, 20, 8)).toBe("hl");
    expect(elementAt(scene, 20, 20, 8)).toBe("img");
    expect(elementAt(scene, 200, 200, 8)).toBeNull();
  });

  it("a legacy highlighter is hit within half its 3x drawn width; a px one within half its size", () => {
    const scene = new Scene([hl]);
    expect(elementAt(scene, 64, 20, 8)).toBe("hl"); // legacy: 30 wide, reach 15
    scene.update("hl", { sizeMode: "px" }); // 10 wide: reach max(5, 8) = 8
    expect(elementAt(scene, 64, 20, 8)).toBeNull();
    expect(elementAt(scene, 57, 20, 8)).toBe("hl");
  });

  it("a one-point stroke (a dot) is hit around the point", () => {
    const dot: StrokeEl = { ...s("dot"), points: [[10, 10, 0.5]] };
    expect(elementAt(new Scene([dot]), 15, 15, 8)).toBe("dot");
  });
});

describe("Selection.recolor", () => {
  it("recolours only the selected strokes, as one change", () => {
    const scene = new Scene([s("a"), s("b"), t]);
    const sel = new Selection(scene);
    sel.set(["a", "b", "t"]);
    const history = new History();
    history.push(sel.recolor("#2563EB"));
    expect((scene.get("a") as StrokeEl).color).toBe("#2563EB");
    expect((scene.get("b") as StrokeEl).color).toBe("#2563EB");
    expect((scene.get("t") as TextEl).color).toBe("#000");
    history.undo(scene);
    expect((scene.get("a") as StrokeEl).color).toBe("#000");
    expect((scene.get("b") as StrokeEl).color).toBe("#000");
    expect(history.canUndo()).toBe(false);
  });
});
