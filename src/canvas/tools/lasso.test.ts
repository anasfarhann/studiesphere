import { beforeEach, describe, expect, it } from "vitest";
import { Scene } from "../model/scene";
import { History } from "../model/history";
import { pointInPolygon } from "../geometry/point-in-polygon";
import type { ImageEl, StrokeEl, TextEl } from "../model/types";
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

  it("boxes are selected when they overlap the lasso", () => {
    const inside: TextEl = { id: "t1", type: "text", x: 40, y: 40, w: 40, text: "hi", fontSize: 10, color: "#000", z: 0, updatedAt: 1 };
    const outside: TextEl = { ...inside, id: "t2", x: 110, y: 90, w: 100 };
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

describe("elementsInLasso: boxes overlap the polygon at all", () => {
  const img: ImageEl = { id: "img", type: "image", x: 80, y: 80, w: 100, h: 100, assetPath: "o/p/i.png", z: 0, updatedAt: 1 };
  it("a lasso partly over an image selects it (bounds corner inside the polygon)", () => {
    expect(elementsInLasso(new Scene([img]), box)).toEqual(["img"]);
  });
  it("a small lasso drawn entirely inside an image selects it (polygon vertex inside the bounds)", () => {
    const tiny: [number, number][] = [[100, 100], [110, 100], [110, 110]];
    expect(elementsInLasso(new Scene([img]), tiny)).toEqual(["img"]);
  });
  it("a lasso crossing a text box without corners on either side selects it (edges cross)", () => {
    const txt: TextEl = { id: "t", type: "text", x: 0, y: 40, w: 200, text: "hi", fontSize: 10, color: "#000", z: 0, updatedAt: 1 };
    const band: [number, number][] = [[90, 0], [110, 0], [110, 100], [90, 100]];
    expect(elementsInLasso(new Scene([txt]), band)).toEqual(["t"]);
  });
  it("a lasso near but not touching a box does not select it", () => {
    const far: ImageEl = { ...img, x: 120, y: 120 };
    expect(elementsInLasso(new Scene([far]), box)).toEqual([]);
  });
});

describe("LassoTool taps", () => {
  const image: ImageEl = { id: "img", type: "image", x: 0, y: 0, w: 100, h: 100, assetPath: "o/p/i.png", z: 0, updatedAt: 1 };
  const over = (): StrokeEl => ({ ...stroke("ink", [[10, 50], [90, 50]]), z: 1 });
  let scene: Scene;
  let selection: Selection;
  let empty: [number, number][];
  let zoom: number;
  let tool: LassoTool;

  beforeEach(() => {
    scene = new Scene([image, over()]);
    selection = new Selection(scene);
    empty = [];
    zoom = 1;
    tool = new LassoTool({
      scene, history: new History(), selection, setLasso: () => {}, zoom: () => zoom,
      onEmpty: (at) => empty.push(at),
    });
  });

  const tap = (x: number, y: number, jitter = 0) => {
    tool.down([x, y, 0.5], mouse);
    if (jitter) tool.move([[x + jitter, y, 0.5]], mouse);
    tool.up();
  };

  it("a tap selects the topmost element under it", () => {
    tap(50, 52);
    expect(selection.ids).toEqual(["ink"]);
    tap(50, 80);
    expect(selection.ids).toEqual(["img"]);
  });

  it("strokes are hit within 8 screen px of their path, scaled by zoom", () => {
    scene.remove("img");
    tap(50, 57);
    expect(selection.ids).toEqual(["ink"]);
    tap(50, 60);
    expect(selection.ids).toEqual([]);
    zoom = 0.5; // 8 screen px = 16 world units
    tap(50, 64);
    expect(selection.ids).toEqual(["ink"]);
  });

  it("wide strokes are hit within half their drawn width", () => {
    scene.remove("img");
    scene.update("ink", { size: 40 });
    tap(50, 68);
    expect(selection.ids).toEqual(["ink"]);
  });

  it("movement under 6 screen px is still a tap; more is a lasso", () => {
    tap(50, 80, 5);
    expect(selection.ids).toEqual(["img"]);
    tool.down([300, 300, 0.5], mouse);
    tool.move([[310, 300, 0.5]], mouse);
    tool.up();
    expect(selection.ids).toEqual([]);
  });

  it("a tap on empty space clears the selection and reports the spot", () => {
    tap(50, 80);
    tap(300, 300);
    expect(selection.ids).toEqual([]);
    expect(empty).toEqual([[300, 300]]);
  });

  it("a lasso that selects nothing reports its bounds centre", () => {
    tool.down([200, 200, 0.5], mouse);
    tool.move([[300, 200, 0.5], [300, 260, 0.5], [200, 260, 0.5]], mouse);
    tool.up();
    expect(selection.ids).toEqual([]);
    expect(empty).toEqual([[250, 230]]);
  });

  it("a tap inside the current selection picks the element under it", () => {
    selection.set(["img", "ink"]);
    tap(50, 80);
    expect(selection.ids).toEqual(["img"]);
  });

  it("a cancelled tap (a second finger arriving) selects nothing", () => {
    tool.down([50, 80, 0.5], mouse);
    tool.cancel();
    expect(selection.ids).toEqual([]);
    expect(empty).toEqual([]);
  });
});
