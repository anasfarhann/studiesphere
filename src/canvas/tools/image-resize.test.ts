import { describe, expect, it } from "vitest";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { ImageEl } from "../model/types";
import { Selection } from "../selection";
import { LassoTool } from "./lasso";
import { HANDLE_HIT_PX } from "./image-resize";

const img: ImageEl = { id: "i", z: 0, updatedAt: 1, type: "image", x: 100, y: 100, w: 200, h: 100, assetPath: "a" };
const info = { kind: "mouse" as const, pressure: 0.5, timeStamp: 0, shiftKey: false };

function setup(zoom = 1) {
  const scene = new Scene([img]);
  const history = new History();
  const selection = new Selection(scene);
  selection.set(["i"]);
  const lasso = new LassoTool({ scene, history, selection, setLasso: () => {}, zoom: () => zoom });
  return { scene, history, lasso };
}

describe("image corner resize", () => {
  it("dragging the bottom-right handle keeps the aspect ratio, as one history step", () => {
    const { scene, history, lasso } = setup();
    lasso.down([300, 200, 0.5], info);
    lasso.move([[400, 210, 0.5]], info);
    lasso.move([[500, 300, 0.5]], info);
    lasso.up();
    expect(scene.get("i")).toMatchObject({ x: 100, y: 100, w: 400, h: 200 });
    history.undo(scene);
    expect(scene.get("i")).toMatchObject({ w: 200, h: 100 });
    expect(history.canUndo()).toBe(false);
  });

  it("hit area is 44 screen px, whatever the zoom", () => {
    const { scene, lasso } = setup(2);
    // At zoom 2 the handle reaches 22 screen px = 11 world units from the corner.
    expect(HANDLE_HIT_PX).toBeGreaterThanOrEqual(44);
    lasso.down([300 + 10, 200 + 10, 0.5], info);
    lasso.move([[400, 300, 0.5]], info);
    lasso.up();
    expect(scene.get("i")?.type === "image" && (scene.get("i") as ImageEl).w).toBeGreaterThan(200);
  });

  it("a press away from the handle does not resize", () => {
    const { scene, lasso } = setup();
    lasso.down([300 + 30, 200 + 30, 0.5], info);
    lasso.move([[500, 500, 0.5]], info);
    lasso.up();
    expect((scene.get("i") as ImageEl).w).toBe(200);
  });

  it("never shrinks below a minimum, and a tap on the handle changes nothing", () => {
    const { scene, history, lasso } = setup();
    lasso.down([300, 200, 0.5], info);
    lasso.up();
    expect(history.canUndo()).toBe(false);
    lasso.down([300, 200, 0.5], info);
    lasso.move([[0, 0, 0.5]], info);
    lasso.up();
    expect((scene.get("i") as ImageEl).w).toBeGreaterThanOrEqual(24);
  });

  it("without a single selected image the corner moves the selection instead", () => {
    const scene = new Scene([img, { ...img, id: "j", x: 0, y: 0 }]);
    const selection = new Selection(scene);
    selection.set(["i", "j"]);
    const lasso = new LassoTool({ scene, history: new History(), selection, setLasso: () => {}, zoom: () => 1 });
    lasso.down([300, 200, 0.5], info);
    lasso.move([[350, 250, 0.5]], info);
    lasso.up();
    expect(scene.get("i")).toMatchObject({ w: 200, x: 150 });
  });
});
