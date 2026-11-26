import { describe, expect, it } from "vitest";
import { boundsOf, TEXT_LINE_HEIGHT } from "../model/bounds";
import { wrapText } from "../model/wrap-text";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { TextEl } from "../model/types";
import { Selection } from "../selection";
import { LassoTool } from "./lasso";
import { TEXT_HANDLE_HIT_PX } from "./text-resize";

const box: TextEl = {
  id: "t", z: 0, updatedAt: 1, type: "text", x: 100, y: 100, w: 200, text: "alpha beta gamma delta epsilon", fontSize: 20, color: "#000", autoW: true,
};
const info = { kind: "mouse" as const, pressure: 0.5, timeStamp: 0, shiftKey: false };

function setup(el: TextEl = box, zoom = 1) {
  const scene = new Scene([el]);
  const history = new History();
  const selection = new Selection(scene);
  selection.set([el.id]);
  const lasso = new LassoTool({ scene, history, selection, setLasso: () => {}, zoom: () => zoom });
  const b = boundsOf(el);
  return { scene, history, lasso, edge: [b.maxX, (b.minY + b.maxY) / 2] as const };
}

const get = (scene: Scene) => scene.get("t") as TextEl;

describe("text box right-edge resize", () => {
  it("dragging the handle sets w, clears autoW, wraps (taller), as one undo step", () => {
    const { scene, history, lasso, edge } = setup();
    const h0 = boundsOf(get(scene)).maxY - boundsOf(get(scene)).minY;
    lasso.down([edge[0], edge[1], 0.5], info);
    lasso.move([[edge[0] - 50, edge[1], 0.5]], info);
    lasso.move([[edge[0] - 100, edge[1] + 30, 0.5]], info);
    lasso.up();
    const after = get(scene);
    expect(after).toMatchObject({ x: 100, y: 100, w: 100, autoW: false });
    expect(boundsOf(after).maxY - boundsOf(after).minY).toBeGreaterThan(h0);
    history.undo(scene);
    expect(get(scene)).toMatchObject({ w: 200, autoW: true });
    expect(history.canUndo()).toBe(false);
  });

  it("after a resize the bounds height is the really measured line count x line height", () => {
    const measure = (s: string, f: number) => s.length * f * 0.45; // "real" glyphs narrower than the approximation
    const scene = new Scene([box]);
    const history = new History();
    const selection = new Selection(scene);
    selection.set(["t"]);
    const lasso = new LassoTool({ scene, history, selection, setLasso: () => {}, zoom: () => 1, measureText: () => measure });
    const b0 = boundsOf(box);
    const y = (b0.minY + b0.maxY) / 2;
    lasso.down([b0.maxX, y, 0.5], info);
    lasso.move([[b0.maxX - 60, y, 0.5]], info);
    lasso.up();
    const after = get(scene);
    const lines = wrapText(measure, after.text, after.w, after.fontSize).length;
    expect(after.lines).toBe(lines);
    const h = boundsOf(after).maxY - boundsOf(after).minY;
    expect(Math.abs(h - lines * after.fontSize * TEXT_LINE_HEIGHT)).toBeLessThanOrEqual(1);
    history.undo(scene);
    expect("lines" in get(scene)).toBe(false);
  });

  it("a legacy box resized and undone gets its exact old fields back", () => {
    const legacy: TextEl = { ...box, autoW: undefined };
    delete legacy.autoW;
    const { scene, history, lasso, edge } = setup(legacy);
    lasso.down([edge[0], edge[1], 0.5], info);
    lasso.move([[edge[0] + 100, edge[1], 0.5]], info);
    lasso.up();
    expect(get(scene)).toMatchObject({ w: 300, autoW: false });
    history.undo(scene);
    expect("autoW" in get(scene)).toBe(false);
    expect(get(scene).w).toBe(200);
  });

  it("clamps between about two em and 2000", () => {
    const { scene, lasso, edge } = setup();
    lasso.down([edge[0], edge[1], 0.5], info);
    lasso.move([[-5000, edge[1], 0.5]], info);
    lasso.up();
    expect(get(scene).w).toBe(40);
    const s2 = setup();
    s2.lasso.down([s2.edge[0], s2.edge[1], 0.5], info);
    s2.lasso.move([[9000, s2.edge[1], 0.5]], info);
    s2.lasso.up();
    expect(get(s2.scene).w).toBe(2000);
  });

  it("hit area is at least 44 screen px; a tap on the handle changes nothing", () => {
    expect(TEXT_HANDLE_HIT_PX).toBeGreaterThanOrEqual(44);
    const { scene, history, lasso, edge } = setup(box, 2);
    // At zoom 2, 20 screen px right of the edge is 10 world units.
    lasso.down([edge[0] + 10, edge[1], 0.5], info);
    lasso.up();
    expect(history.canUndo()).toBe(false);
    lasso.down([edge[0] + 10, edge[1], 0.5], info);
    lasso.move([[edge[0] + 60, edge[1], 0.5]], info);
    lasso.up();
    expect(get(scene).w).toBe(250);
  });

  it("dragging inside the box (away from the edge) still moves it", () => {
    const { scene, lasso } = setup();
    lasso.down([130, 110, 0.5], info);
    lasso.move([[180, 160, 0.5]], info);
    lasso.up();
    expect(get(scene)).toMatchObject({ x: 150, y: 150, w: 200, autoW: true });
  });

  it("only for a single selected text box", () => {
    const scene = new Scene([box, { ...box, id: "u", y: 400 }]);
    const selection = new Selection(scene);
    selection.set(["t", "u"]);
    const lasso = new LassoTool({ scene, history: new History(), selection, setLasso: () => {}, zoom: () => 1 });
    const b = boundsOf(box);
    lasso.down([b.maxX, (b.minY + b.maxY) / 2, 0.5], info);
    lasso.move([[b.maxX + 50, (b.minY + b.maxY) / 2, 0.5]], info);
    lasso.up();
    // Not a width-only resize: the edge is inside the selection's top-right corner target, which scales it all.
    expect(get(scene).fontSize).not.toBe(20);
    expect((scene.get("u") as TextEl).fontSize).toBe(get(scene).fontSize);
  });
});
