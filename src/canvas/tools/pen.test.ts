import { beforeEach, describe, expect, it } from "vitest";
import { Scene } from "../model/scene";
import type { StrokeEl } from "../model/types";
import { PenTool } from "./pen";
import type { PointerInfo } from "./tool";

const pen: PointerInfo = { kind: "pen", pressure: 0.7, timeStamp: 0, shiftKey: false };
const mouse: PointerInfo = { kind: "mouse", pressure: 0.5, timeStamp: 0, shiftKey: false };

describe("PenTool", () => {
  let scene: Scene;
  let live: (StrokeEl | null)[];
  let tool: PenTool;
  let ids: number;

  beforeEach(() => {
    scene = new Scene();
    live = [];
    ids = 0;
    tool = new PenTool({
      scene,
      style: () => ({ color: "#2563eb", size: 4 }),
      setLive: (s) => live.push(s),
      newId: () => `id-${++ids}`,
      now: () => 1000,
    });
  });

  it("down/move/up adds one stroke with all world points and z = scene.nextZ()", () => {
    scene.add({ ...{ id: "old", z: 7, updatedAt: 1, type: "stroke", tool: "pen", color: "#000", size: 2, points: [[0, 0, 0.5]], simulatePressure: true } });
    const expectedZ = scene.nextZ();
    tool.down([10, 20, 0.3], pen);
    tool.move([[11, 21, 0.4], [12, 22, 0.5]], pen);
    tool.move([[13, 23, 0.6]], pen);
    tool.up();
    const strokes = scene.all().filter((e) => e.id !== "old");
    expect(strokes).toHaveLength(1);
    const s = strokes[0] as StrokeEl;
    expect(s).toMatchObject({
      id: "id-1", type: "stroke", tool: "pen", color: "#2563eb", size: 4, z: expectedZ, updatedAt: 1000,
      simulatePressure: false,
    });
    expect(s.points).toEqual([[10, 20, 0.3], [11, 21, 0.4], [12, 22, 0.5], [13, 23, 0.6]]);
    expect(live.at(-1)).toBeNull();
    expect(live.some((l) => l !== null && l.points.length === 4)).toBe(true);
  });

  it("mouse strokes simulate pressure", () => {
    tool.down([0, 0, 0.5], mouse);
    tool.move([[5, 5, 0.5]], mouse);
    tool.up();
    expect((scene.all()[0] as StrokeEl).simulatePressure).toBe(true);
  });

  it("cancel() adds nothing and clears the live stroke", () => {
    tool.down([0, 0, 0.5], pen);
    tool.move([[5, 5, 0.5]], pen);
    tool.cancel();
    tool.up();
    expect(scene.all()).toHaveLength(0);
    expect(live.at(-1)).toBeNull();
  });

  it("a down/up with no movement adds a dot stroke (1 point)", () => {
    tool.down([3, 4, 0.5], pen);
    tool.up();
    const all = scene.all();
    expect(all).toHaveLength(1);
    expect((all[0] as StrokeEl).points).toEqual([[3, 4, 0.5]]);
  });

  it("move or up without down does nothing", () => {
    tool.move([[1, 1, 0.5]], pen);
    tool.up();
    expect(scene.all()).toHaveLength(0);
  });

  it("uses the style at the time the stroke starts", () => {
    let color = "#111827";
    const t = new PenTool({ scene, style: () => ({ color, size: 8 }), setLive: () => {} });
    t.down([0, 0, 0.5], pen);
    color = "#dc2626";
    t.up();
    expect((scene.all()[0] as StrokeEl).color).toBe("#111827");
    expect(typeof scene.all()[0].id).toBe("string");
  });
});
