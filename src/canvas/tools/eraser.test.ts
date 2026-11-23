import { describe, expect, it } from "vitest";
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
});
