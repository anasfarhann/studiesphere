import { describe, expect, it } from "vitest";
import { History } from "./model/history";
import { Scene } from "./model/scene";
import type { StrokeEl, TextEl } from "./model/types";
import { Selection } from "./selection";

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
});
