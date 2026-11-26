import { describe, expect, it } from "vitest";
import { boundsOf, CARD_H, CARD_W } from "../model/bounds";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { AudioEl, CanvasElement, ImageEl, Rect, StrokeEl, TextEl } from "../model/types";
import { Selection } from "../selection";
import { LassoTool } from "./lasso";
import { cornerAt, isScalable, MIN_SELECTION_PX, SCALE_HANDLE_HIT_PX, scaledElement } from "./selection-scale";
import type { PointerInfo } from "./tool";

const info: PointerInfo = { kind: "pen", pressure: 0.5, timeStamp: 0, shiftKey: false };
/** 1 world unit per char at any font size: easy line maths. */
const measure = () => (s: string, fontSize: number) => s.length * fontSize * 0.5;

const pen = (id: string, pts: [number, number][], extra: Partial<StrokeEl> = {}): StrokeEl => ({
  id, z: 0, updatedAt: 1, type: "stroke", tool: "pen", color: "#000", size: 4, simulatePressure: true,
  points: pts.map(([x, y]) => [x, y, 0.5]), ...extra,
});
const photo: ImageEl = { id: "i", z: 2, updatedAt: 1, type: "image", x: 200, y: 100, w: 100, h: 50, assetPath: "a", crop: { x: 0.1, y: 0, w: 0.5, h: 1 } };
const fixedText: TextEl = { id: "t", z: 1, updatedAt: 1, type: "text", x: 100, y: 200, w: 80, autoW: false, lines: 1, text: "hello", fontSize: 20, color: "#000" };

function union(scene: Scene, ids: string[]): Rect {
  const bs = ids.map((id) => boundsOf(scene.get(id) as CanvasElement));
  return {
    minX: Math.min(...bs.map((b) => b.minX)), minY: Math.min(...bs.map((b) => b.minY)),
    maxX: Math.max(...bs.map((b) => b.maxX)), maxY: Math.max(...bs.map((b) => b.maxY)),
  };
}

function setup(elements: CanvasElement[], ids: string[], zoom = 1) {
  const scene = new Scene(elements);
  const history = new History();
  const selection = new Selection(scene);
  selection.set(ids);
  const lasso = new LassoTool({ scene, history, selection, setLasso: () => {}, zoom: () => zoom, measureText: measure });
  return { scene, history, selection, lasso };
}

function drag(lasso: LassoTool, from: [number, number], to: [number, number]) {
  lasso.down([from[0], from[1], 0.5], info);
  lasso.move([[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, 0.5]], info);
  lasso.move([[to[0], to[1], 0.5]], info);
  lasso.up();
}

describe("scaledElement", () => {
  it("strokes: points about the anchor and size scale, pressure and style are kept", () => {
    const s = pen("s", [[10, 10], [30, 20]], { tool: "highlighter" });
    const out = scaledElement(s, 0, 0, 2) as StrokeEl;
    expect(out.points).toEqual([[20, 20, 0.5], [60, 40, 0.5]]);
    expect(out.size).toBe(8);
    expect(out.tool).toBe("highlighter");
    expect(out.sizeMode).toBeUndefined();
  });

  it("legacy highlighters keep their 3x rule, so their drawn width scales like everything else", () => {
    const legacy = pen("s", [[0, 0], [10, 0]], { tool: "highlighter", size: 6 });
    const b0 = boundsOf(legacy);
    const b1 = boundsOf(scaledElement(legacy, b0.minX, b0.minY, 0.5));
    expect(b1.maxY - b1.minY).toBeCloseTo((b0.maxY - b0.minY) / 2);
  });

  it("images: x, y, w and h scale; the crop is untouched", () => {
    const out = scaledElement(photo, 0, 0, 0.5) as ImageEl;
    expect(out).toMatchObject({ x: 100, y: 50, w: 50, h: 25, crop: photo.crop });
  });

  it("fixed text boxes: position, font size and wrap width scale; lines are re-measured", () => {
    const out = scaledElement(fixedText, 100, 200, 2, measure) as TextEl;
    expect(out).toMatchObject({ x: 100, y: 200, w: 160, fontSize: 40, autoW: false, lines: 1 });
  });

  it("legacy text boxes scale w and get no stored line count", () => {
    const legacy: TextEl = { id: "l", z: 0, updatedAt: 1, type: "text", x: 10, y: 10, w: 100, text: "hi", fontSize: 10, color: "#000" };
    const out = scaledElement(legacy, 0, 0, 3, measure) as TextEl;
    expect(out).toMatchObject({ x: 30, y: 30, w: 300, fontSize: 30 });
    expect("lines" in out).toBe(false);
    expect("autoW" in out).toBe(false);
  });

  it("auto text boxes become fixed at their scaled layout width, so they wrap exactly as before", () => {
    const auto: TextEl = { ...fixedText, autoW: true, w: 999, maxW: 300 };
    const out = scaledElement(auto, 0, 0, 2, measure) as TextEl;
    expect(out.fontSize).toBe(40);
    // Layout width at 20: "hello" = 5 * 20 * 0.5 = 50, plus 0.3 em (6) = 56; scaled 2x.
    expect(out).toMatchObject({ autoW: false, w: 112, lines: 1 });
    expect("maxW" in out).toBe(false);
  });

  it("an auto box 400 wide scaled 2x keeps its line count and is about 800 wide (no rewrap at the auto cap)", () => {
    // 2 lines: the long one is 39 chars * 20 * 0.5 = 390 (+ 6 padding = 396 -> ceil 396).
    const text = "a".repeat(39) + "\n" + "b".repeat(10);
    const auto: TextEl = { ...fixedText, autoW: true, w: 396, lines: 2, text };
    const out = scaledElement(auto, 0, 0, 2, measure) as TextEl;
    expect(out.lines).toBe(2);
    expect(out.w).toBeCloseTo(792);
    expect(out.autoW).toBe(false);
  });

  it("a card on the selection's edge: its centre scales, so its edge (and that corner) moves by half its size", () => {
    // Card at the selection's top-left, scaled 2x about that corner: its centre doubles its distance.
    const card: AudioEl = { id: "a", z: 0, updatedAt: 1, type: "audio", x: 0, y: 0, assetPath: "x", durationMs: 1 };
    const out = scaledElement(card, 0, 0, 2);
    expect(out).toMatchObject({ x: CARD_W / 2, y: CARD_H / 2 });
  });

  it("cards keep their fixed size: their centre moves with the scale", () => {
    const card: AudioEl = { id: "a", z: 0, updatedAt: 1, type: "audio", x: 0, y: 0, assetPath: "x", durationMs: 1 };
    const b = boundsOf(card);
    const out = scaledElement(card, b.minX, b.minY, 2);
    const ob = boundsOf(out);
    expect((ob.minX + ob.maxX) / 2).toBeCloseTo(((b.minX + b.maxX) / 2) * 2);
    expect(ob.maxX - ob.minX).toBe(b.maxX - b.minX);
  });
});

describe("isScalable and cornerAt", () => {
  it("one stroke or any several elements are scalable; a single photo, text box or card is not", () => {
    const st = pen("s", [[0, 0], [1, 1]]);
    expect(isScalable([st])).toBe(true);
    expect(isScalable([st, photo])).toBe(true);
    expect(isScalable([photo, fixedText])).toBe(true);
    expect(isScalable([photo])).toBe(false);
    expect(isScalable([fixedText])).toBe(false);
    expect(isScalable([])).toBe(false);
  });

  it("each corner has a 44 screen px target, reaching at most a quarter of the box inside", () => {
    const b: Rect = { minX: 0, minY: 0, maxX: 400, maxY: 200 };
    expect(SCALE_HANDLE_HIT_PX).toBeGreaterThanOrEqual(44);
    expect(cornerAt(b, -21, -21, 1)).toBe("nw");
    expect(cornerAt(b, 421, 221, 1)).toBe("se");
    expect(cornerAt(b, 421, -10, 1)).toBe("ne");
    expect(cornerAt(b, 10, 210, 1)).toBe("sw");
    expect(cornerAt(b, -30, 0, 1)).toBeNull();
    // At zoom 2 the target is 11 world units each way.
    expect(cornerAt(b, -12, 0, 2)).toBeNull();
    expect(cornerAt(b, -10, 0, 2)).toBe("nw");
    // A small box: its middle is not a corner.
    const small: Rect = { minX: 0, minY: 0, maxX: 20, maxY: 20 };
    expect(cornerAt(small, 10, 10, 1)).toBeNull();
    expect(cornerAt(small, 4, 4, 1)).toBe("nw");
  });
});

describe("LassoTool corner scaling", () => {
  const a = pen("a", [[100, 100], [140, 120]]);
  const b = pen("b", [[160, 140], [200, 180]]);

  it("dragging the bottom-right corner scales uniformly about the top-left corner, which stays fixed", () => {
    const { scene, lasso } = setup([a, b], ["a", "b"]);
    const r0 = union(scene, ["a", "b"]);
    drag(lasso, [r0.maxX, r0.maxY], [r0.minX + (r0.maxX - r0.minX) * 2, r0.minY + (r0.maxY - r0.minY) * 2]);
    const r1 = union(scene, ["a", "b"]);
    expect(r1.minX).toBeCloseTo(r0.minX);
    expect(r1.minY).toBeCloseTo(r0.minY);
    expect(r1.maxX - r1.minX).toBeCloseTo((r0.maxX - r0.minX) * 2);
    expect(r1.maxY - r1.minY).toBeCloseTo((r0.maxY - r0.minY) * 2);
    expect((scene.get("a") as StrokeEl).size).toBeCloseTo(8);
  });

  it("dragging the top-left corner keeps the bottom-right corner fixed", () => {
    const { scene, lasso } = setup([a, b], ["a", "b"]);
    const r0 = union(scene, ["a", "b"]);
    const w = r0.maxX - r0.minX;
    const h = r0.maxY - r0.minY;
    drag(lasso, [r0.minX, r0.minY], [r0.minX + w / 2, r0.minY + h / 2]);
    const r1 = union(scene, ["a", "b"]);
    expect(r1.maxX).toBeCloseTo(r0.maxX);
    expect(r1.maxY).toBeCloseTo(r0.maxY);
    expect(r1.maxX - r1.minX).toBeCloseTo(w / 2);
  });

  it("the grab offset is kept: the press need not be exactly on the corner", () => {
    const { scene, lasso } = setup([a, b], ["a", "b"]);
    const r0 = union(scene, ["a", "b"]);
    lasso.down([r0.maxX + 5, r0.maxY + 5, 0.5], info);
    lasso.move([[r0.maxX + 5, r0.maxY + 5, 0.5]], info);
    lasso.up();
    const r1 = union(scene, ["a", "b"]);
    expect(r1.maxX).toBeCloseTo(r0.maxX);
  });

  it("a mixed selection keeps its proportions and is one undo step", () => {
    const els = [a, fixedText, photo];
    const ids = ["a", "t", "i"];
    const { scene, history, lasso } = setup(els, ids);
    const r0 = union(scene, ids);
    drag(lasso, [r0.maxX, r0.maxY], [r0.minX + (r0.maxX - r0.minX) * 1.5, r0.minY + (r0.maxY - r0.minY) * 1.5]);
    const img = scene.get("i") as ImageEl;
    expect(img.x - r0.minX).toBeCloseTo((photo.x - r0.minX) * 1.5);
    expect(img.w / img.h).toBeCloseTo(2);
    expect((scene.get("t") as TextEl).fontSize).toBeCloseTo(30);
    expect((scene.get("a") as StrokeEl).size).toBeCloseTo(6);
    history.undo(scene);
    expect(scene.get("i")).toMatchObject({ x: 200, w: 100, h: 50 });
    expect(scene.get("t")).toMatchObject({ x: 100, fontSize: 20, w: 80 });
    expect(scene.get("a")).toMatchObject({ size: 4, points: a.points });
    expect(history.canUndo()).toBe(false);
    history.redo(scene);
    expect((scene.get("i") as ImageEl).w).toBeCloseTo(150);
  });

  it("undo removes a line count the scale stored on a box that had none", () => {
    const noLines: TextEl = { ...fixedText, lines: undefined };
    delete noLines.lines;
    const { scene, history, lasso } = setup([a, noLines], ["a", "t"]);
    const r0 = union(scene, ["a", "t"]);
    drag(lasso, [r0.maxX, r0.maxY], [r0.maxX + 40, r0.maxY + 40]);
    expect((scene.get("t") as TextEl).lines).toBe(1);
    history.undo(scene);
    expect("lines" in (scene.get("t") as TextEl)).toBe(false);
  });

  it("never shrinks below 8 screen px", () => {
    // Thick strokes, so their 0.5 size floor is not what stops the shrink.
    const { scene, lasso } = setup([{ ...a, size: 40 }, { ...b, size: 40 }], ["a", "b"], 2);
    const r0 = union(scene, ["a", "b"]);
    drag(lasso, [r0.maxX, r0.maxY], [r0.minX - 500, r0.minY - 500]);
    const r1 = union(scene, ["a", "b"]);
    expect(Math.max(r1.maxX - r1.minX, r1.maxY - r1.minY) * 2).toBeCloseTo(MIN_SELECTION_PX);
    expect(r1.minX).toBeCloseTo(r0.minX);
  });

  it("growing stops at the first element to reach its limit, keeping proportions", () => {
    // Pen size 4 may reach 200 (s <= 50); text 20 may reach 400 (s <= 20): the text wins.
    const { scene, lasso } = setup([a, fixedText], ["a", "t"]);
    const r0 = union(scene, ["a", "t"]);
    drag(lasso, [r0.maxX, r0.maxY], [r0.maxX + 100_000, r0.maxY + 100_000]);
    expect((scene.get("t") as TextEl).fontSize).toBeCloseTo(400);
    expect((scene.get("a") as StrokeEl).size).toBeCloseTo(80);
    // Fixed width 80 * 20 = 1600, under TEXT_MAX_W.
    expect((scene.get("t") as TextEl).w).toBeCloseTo(1600);
  });

  it("a fixed text box never grows past TEXT_MAX_W; a stroke never past 200", () => {
    const wide: TextEl = { ...fixedText, w: 1000 };
    const one = setup([a, wide], ["a", "t"]);
    let r0 = union(one.scene, ["a", "t"]);
    drag(one.lasso, [r0.maxX, r0.maxY], [r0.maxX + 100_000, r0.maxY + 100_000]);
    expect((one.scene.get("t") as TextEl).w).toBeCloseTo(2000);
    const two = setup([a, b], ["a", "b"]);
    r0 = union(two.scene, ["a", "b"]);
    drag(two.lasso, [r0.maxX, r0.maxY], [r0.maxX + 100_000, r0.maxY + 100_000]);
    expect((two.scene.get("a") as StrokeEl).size).toBeCloseTo(200);
  });

  it("shrinking stops at the first element to reach its minimum", () => {
    // Text 20 may shrink to 6 (s >= 0.3); photo 100x50 to 8 high (s >= 0.16); pen 4 to 0.5 (s >= 0.125).
    const { scene, lasso } = setup([a, fixedText, photo], ["a", "t", "i"]);
    const r0 = union(scene, ["a", "t", "i"]);
    drag(lasso, [r0.maxX, r0.maxY], [r0.minX - 1000, r0.minY - 1000]);
    expect((scene.get("t") as TextEl).fontSize).toBeCloseTo(6);
    expect((scene.get("i") as ImageEl).h).toBeCloseTo(15);
    const thin = setup([pen("p", [[0, 0], [400, 0]], { size: 1 }), pen("q", [[0, 10], [400, 10]], { size: 1 })], ["p", "q"]);
    const r1 = union(thin.scene, ["p", "q"]);
    drag(thin.lasso, [r1.maxX, r1.maxY], [r1.minX - 1000, r1.minY - 1000]);
    expect((thin.scene.get("p") as StrokeEl).size).toBeCloseTo(0.5);
  });

  it("an element already past a limit never blocks the other direction or forces a jump", () => {
    const huge = pen("h", [[0, 0], [10, 10]], { size: 300 });
    const { scene, lasso } = setup([huge, a], ["h", "a"]);
    const r0 = union(scene, ["h", "a"]);
    drag(lasso, [r0.maxX, r0.maxY], [r0.minX + (r0.maxX - r0.minX) * 0.5, r0.minY + (r0.maxY - r0.minY) * 0.5]);
    expect((scene.get("h") as StrokeEl).size).toBeCloseTo(150);
  });

  it("a single stroke scales too", () => {
    const { scene, lasso } = setup([a], ["a"]);
    const r0 = union(scene, ["a"]);
    drag(lasso, [r0.maxX, r0.maxY], [r0.minX + (r0.maxX - r0.minX) * 3, r0.minY + (r0.maxY - r0.minY) * 3]);
    expect((scene.get("a") as StrokeEl).size).toBeCloseTo(12);
  });

  it("a press inside the box away from the corners still moves the selection", () => {
    const { scene, history, lasso } = setup([a, b], ["a", "b"]);
    drag(lasso, [150, 140], [160, 150]);
    expect((scene.get("a") as StrokeEl).points[0]).toEqual([110, 110, 0.5]);
    expect((scene.get("a") as StrokeEl).size).toBe(4);
    expect(history.canUndo()).toBe(true);
  });

  it("a corner press without movement changes nothing and adds no undo step", () => {
    const { scene, history, lasso } = setup([a, b], ["a", "b"]);
    const r0 = union(scene, ["a", "b"]);
    lasso.down([r0.maxX, r0.maxY, 0.5], info);
    lasso.up();
    expect(scene.get("a")).toEqual(a);
    expect(history.canUndo()).toBe(false);
  });

  it("cancel keeps the scale so far as one undo step", () => {
    const { scene, history, lasso } = setup([a, b], ["a", "b"]);
    const r0 = union(scene, ["a", "b"]);
    lasso.down([r0.maxX, r0.maxY, 0.5], info);
    lasso.move([[r0.maxX + 50, r0.maxY + 50, 0.5]], info);
    lasso.cancel();
    expect((scene.get("a") as StrokeEl).size).toBeGreaterThan(4);
    history.undo(scene);
    expect(scene.get("a")).toMatchObject({ size: 4 });
  });

  it("a single photo keeps its own handle: its top-left corner does not scale it", () => {
    const { scene, lasso } = setup([photo], ["i"]);
    drag(lasso, [200, 100], [150, 50]);
    // Pressing inside a selection moves it; the top-left corner is not a scale handle for one photo.
    expect(scene.get("i")).toMatchObject({ w: 100, h: 50 });
  });
});
