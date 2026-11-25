import { describe, expect, it, vi } from "vitest";
import * as split from "../geometry/split-stroke";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { StrokeEl, TextEl } from "../model/types";
import { EraserTool } from "./eraser";
import type { PointerInfo } from "./tool";

const mouse: PointerInfo = { kind: "mouse", pressure: 0.5, timeStamp: 0, shiftKey: false };
const line = (id: string, y: number): StrokeEl => ({
  id, z: 0, updatedAt: 1, type: "stroke", tool: "pen", color: "#000", size: 2,
  points: [[0, y, 0.5], [100, y, 0.5]], simulatePressure: true,
});

function setup() {
  const scene = new Scene();
  const history = new History();
  let n = 0;
  const tool = new EraserTool({ scene, history, radius: () => 5, newId: () => `n${++n}`, now: () => 2 });
  return { scene, history, tool };
}

describe("EraserTool", () => {
  it("one drag across 3 strokes undoes in one step", () => {
    const { scene, history, tool } = setup();
    scene.add(line("a", 0));
    scene.add(line("b", 30));
    scene.add(line("c", 60));
    tool.down([50, -10, 0.5], mouse);
    tool.move([[50, 0, 0.5], [50, 30, 0.5], [50, 60, 0.5], [50, 80, 0.5]], mouse);
    tool.up();
    expect(scene.all().length).toBe(6); // each split in two
    expect(scene.get("a")).toBeUndefined();
    history.undo(scene);
    expect(scene.all().map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
    expect(history.canUndo()).toBe(false);
  });

  it("pieces created and erased again in one drag do not appear in the change", () => {
    const { scene, history, tool } = setup();
    scene.add(line("a", 0));
    tool.down([50, 0, 0.5], mouse);
    tool.move([[20, 0, 0.5], [80, 0, 0.5]], mouse);
    tool.up();
    history.undo(scene);
    expect(scene.all().map((e) => e.id)).toEqual(["a"]);
    history.redo(scene);
    expect(scene.all().every((e) => e.id !== "a")).toBe(true);
    history.undo(scene);
    expect(scene.all().map((e) => e.id)).toEqual(["a"]);
  });

  it("undo after erase restores with a fresher updatedAt", () => {
    const { scene, history, tool } = setup();
    scene.add(line("a", 0));
    tool.down([50, 0, 0.5], mouse);
    tool.up();
    history.undo(scene);
    expect(scene.get("a")!.updatedAt).toBeGreaterThan(1);
  });

  it("does not erase non-stroke elements and records nothing when nothing is hit", () => {
    const { scene, history, tool } = setup();
    const text: TextEl = { id: "t", z: 0, updatedAt: 1, type: "text", x: 0, y: 0, w: 100, text: "hi", fontSize: 16, color: "#000" };
    scene.add(text);
    tool.down([10, 5, 0.5], mouse);
    tool.up();
    expect(scene.get("t")).toBeDefined();
    expect(history.canUndo()).toBe(false);
  });

  describe("stroke mode", () => {
    const setupStroke = () => {
      const scene = new Scene();
      const history = new History();
      const tool = new EraserTool({ scene, history, radius: () => 5, mode: () => "stroke", newId: () => "x", now: () => 2 });
      return { scene, history, tool };
    };

    it("removes the whole touched stroke in one undo step; undo restores it", () => {
      const { scene, history, tool } = setupStroke();
      scene.add(line("a", 0));
      scene.add(line("b", 30));
      scene.add(line("far", 200));
      tool.down([10, 0, 0.5], mouse);
      tool.move([[10, 30, 0.5]], mouse);
      tool.up();
      expect(scene.all().map((e) => e.id)).toEqual(["far"]);
      history.undo(scene);
      expect(scene.all().map((e) => e.id).sort()).toEqual(["a", "b", "far"]);
      expect(history.canUndo()).toBe(false);
      history.redo(scene);
      expect(scene.all().map((e) => e.id)).toEqual(["far"]);
    });

    it("sweeps between sparse pointer samples and never touches non-strokes", () => {
      const { scene, tool } = setupStroke();
      scene.add(line("a", 40));
      const text: TextEl = { id: "t", z: 0, updatedAt: 1, type: "text", x: 0, y: 40, w: 100, text: "hi", fontSize: 16, color: "#000" };
      scene.add(text);
      tool.down([50, 0, 0.5], mouse);
      tool.move([[50, 80, 0.5]], mouse);
      tool.up();
      expect(scene.get("a")).toBeUndefined();
      expect(scene.get("t")).toBeDefined();
    });

    it("a 2,000-point stroke is tested only when near the pointer and a drag stays fast", () => {
      const { scene, tool } = setupStroke();
      const big: StrokeEl = { ...line("big", 0), points: Array.from({ length: 2000 }, (_, i) => [i, 0, 0.5] as [number, number, number]) };
      scene.add(big);
      scene.add(line("near", 5000));
      const spy = vi.spyOn(split, "strokeTouchesCircle");
      const t0 = performance.now();
      tool.down([0, 1000, 0.5], mouse);
      tool.move([[1999, 1000, 0.5]], mouse);
      expect(spy).not.toHaveBeenCalled(); // bbox query never returns big
      tool.move([[1999, 0, 0.5]], mouse);
      tool.up();
      expect(performance.now() - t0).toBeLessThan(250);
      expect(scene.get("big")).toBeUndefined();
      expect(spy.mock.calls.filter(([el]) => el.id === "big").length).toBeLessThanOrEqual(3); // edge-of-bounds probes, then removed
      spy.mockRestore();
    });
  });

  it("pixel mode on a 2,000-point stroke splits it without scanning unrelated strokes", () => {
    const { scene, tool } = setup();
    scene.add({ ...line("big", 0), points: Array.from({ length: 2000 }, (_, i) => [i, 0, 0.5] as [number, number, number]) });
    scene.add(line("far", 900));
    const spy = vi.spyOn(split, "eraseFromStroke");
    tool.down([1000, 0, 0.5], mouse);
    tool.up();
    expect(spy.mock.calls.every(([el]) => el.id === "big")).toBe(true);
    expect(scene.all().length).toBe(3);
    spy.mockRestore();
  });
});
