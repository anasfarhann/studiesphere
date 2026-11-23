import { beforeEach, describe, expect, it } from "vitest";
import { Scene } from "../model/scene";
import { History } from "../model/history";
import { pointInPolygon } from "../geometry/point-in-polygon";
import type { StrokeEl, TextEl } from "../model/types";
import { Selection } from "../selection";
import { elementsInLasso, LassoTool } from "./lasso";
import type { PointerInfo } from "./tool";

const mouse: PointerInfo = { kind: "mouse", pressure: 0.5, timeStamp: 0, shiftKey: false };

function stroke(id: string, pts: [number, number][]): StrokeEl {
  return {
    id, type: "stroke", tool: "pen", color: "#000", size: 2, z: 0, updatedAt: 1, simulatePressure: true,
    points: pts.map(([x, y]) => [x, y, 0.5]),
  };
}
const box: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];

describe("pointInPolygon", () => {
  it("even-odd ray casting", () => {
    expect(pointInPolygon(50, 50, box)).toBe(true);
    expect(pointInPolygon(150, 50, box)).toBe(false);
    expect(pointInPolygon(-1, 50, box)).toBe(false);
  });
});

describe("elementsInLasso", () => {
  it("lasso around 2 of 3 strokes selects those 2", () => {
    const scene = new Scene([
      stroke("a", [[10, 10], [20, 20], [30, 30]]),
      stroke("b", [[40, 40], [50, 50], [60, 60]]),
      stroke("c", [[300, 300], [310, 310], [320, 320]]),
    ]);
    expect(elementsInLasso(scene, box).sort()).toEqual(["a", "b"]);
  });

  it("a stroke 50% inside is not selected; 60% is", () => {
    const half = stroke("h", [[10, 10], [20, 20], [200, 200], [210, 210]]);
    const sixty = stroke("s", [[10, 10], [20, 20], [30, 30], [200, 200], [210, 210]]);
    expect(elementsInLasso(new Scene([half]), box)).toEqual([]);
    expect(elementsInLasso(new Scene([sixty]), box)).toEqual(["s"]);
  });

  it("boxes are selected when their centre is inside", () => {
    const inside: TextEl = { id: "t1", type: "text", x: 40, y: 40, w: 40, text: "hi", fontSize: 10, color: "#000", z: 0, updatedAt: 1 };
    const outside: TextEl = { ...inside, id: "t2", x: 90, y: 90, w: 100 };
    expect(elementsInLasso(new Scene([inside, outside]), box)).toEqual(["t1"]);
  });
});

describe("LassoTool", () => {
  let scene: Scene;
  let history: History;
  let selection: Selection;
  let lasso: ([number, number][] | null)[];
  let tool: LassoTool;

  beforeEach(() => {
    scene = new Scene([stroke("a", [[10, 10], [20, 20], [30, 30]]), stroke("far", [[500, 500], [510, 510]])]);
    history = new History();
    selection = new Selection(scene);
    lasso = [];
    tool = new LassoTool({ scene, history, selection, setLasso: (p) => lasso.push(p), zoom: () => 1 });
  });

  function drawLasso() {
    tool.down([0, 0, 0.5], mouse);
    tool.move([[100, 0, 0.5], [100, 100, 0.5], [0, 100, 0.5]], mouse);
    tool.up();
  }

  it("drawing a lasso selects and clears the lasso path", () => {
    drawLasso();
    expect(selection.ids).toEqual(["a"]);
    expect(lasso.at(-1)).toBeNull();
    expect(lasso.some((p) => p !== null && p.length > 2)).toBe(true);
  });

  it("dragging inside the selection box moves it as ONE undo step", () => {
    drawLasso();
    tool.down([20, 20, 0.5], mouse);
    tool.move([[25, 22, 0.5]], mouse);
    tool.move([[30, 25, 0.5]], mouse);
    tool.up();
    expect((scene.get("a") as StrokeEl).points[0]).toEqual([20, 15, 0.5]);
    expect(history.canUndo()).toBe(true);
    history.undo(scene);
    expect((scene.get("a") as StrokeEl).points[0]).toEqual([10, 10, 0.5]);
    expect(history.canUndo()).toBe(false);
  });

  it("a tap outside the selection clears it", () => {
    drawLasso();
    tool.down([300, 300, 0.5], mouse);
    tool.up();
    expect(selection.ids).toEqual([]);
  });

  it("cancel mid-move keeps the move undoable", () => {
    drawLasso();
    tool.down([20, 20, 0.5], mouse);
    tool.move([[30, 20, 0.5]], mouse);
    tool.cancel();
    expect(history.canUndo()).toBe(true);
  });
});
