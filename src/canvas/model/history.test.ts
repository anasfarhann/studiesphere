import { describe, expect, it } from "vitest";
import { History } from "./history";
import { Scene } from "./scene";
import type { StrokeEl } from "./types";

const s = (id: string, updatedAt = 1): StrokeEl => ({
  id, z: 0, updatedAt, type: "stroke", tool: "pen", color: "#000", size: 2, points: [[0, 0, 0.5]], simulatePressure: true,
});

describe("History", () => {
  it("undo removes an added element and redo restores it", () => {
    const scene = new Scene();
    const h = new History();
    scene.add(s("a"));
    h.push({ before: [], after: [s("a")] });
    expect(h.canUndo()).toBe(true);
    h.undo(scene);
    expect(scene.all()).toHaveLength(0);
    expect(h.canRedo()).toBe(true);
    h.redo(scene);
    expect(scene.all().map((e) => e.id)).toEqual(["a"]);
  });

  it("a new action after undo clears redo", () => {
    const scene = new Scene();
    const h = new History();
    scene.add(s("a"));
    h.push({ before: [], after: [s("a")] });
    h.undo(scene);
    h.push({ before: [], after: [s("b")] });
    expect(h.canRedo()).toBe(false);
  });

  it("restores elements with a fresh updatedAt greater than the old one", () => {
    const scene = new Scene();
    const h = new History();
    const far = Date.now() + 100000;
    const el = s("a", far);
    h.push({ before: [el], after: [] });
    h.undo(scene);
    expect(scene.get("a")!.updatedAt).toBeGreaterThan(far);
  });

  it("updates in place with a fresh stamp when an id is in both sides", () => {
    const scene = new Scene();
    const h = new History();
    scene.add({ ...s("a"), color: "#f00" });
    h.push({ before: [s("a", 10)], after: [{ ...s("a"), color: "#f00" }] });
    h.undo(scene);
    const el = scene.get("a") as StrokeEl;
    expect(el.color).toBe("#000");
    expect(el.updatedAt).toBeGreaterThan(10);
  });

  it("keeps at most 200 steps", () => {
    const scene = new Scene();
    const h = new History();
    for (let i = 0; i < 205; i++) {
      scene.add(s(`e${i}`));
      h.push({ before: [], after: [s(`e${i}`)] });
    }
    let n = 0;
    while (h.canUndo()) { h.undo(scene); n++; }
    expect(n).toBe(200);
    expect(scene.all()).toHaveLength(5);
  });

  it("notifies listeners", () => {
    const h = new History();
    let calls = 0;
    const off = h.onChange(() => calls++);
    h.push({ before: [], after: [s("a")] });
    off();
    h.push({ before: [], after: [s("b")] });
    expect(calls).toBe(1);
  });
});
