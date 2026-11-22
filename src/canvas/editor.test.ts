import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "./editor";
import type { StrokeEl } from "./model/types";

function fakeCtx() {
  const noop = () => {};
  return {
    fillStyle: "", strokeStyle: "", globalAlpha: 1, lineWidth: 1, font: "", textBaseline: "",
    setTransform: noop, fillRect: noop, fill: noop, fillText: noop, strokeRect: noop, setLineDash: noop,
    beginPath: noop, roundRect: noop, stroke: noop, save: noop, restore: noop,
  };
}

class FakePath { moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {} }

type Kind = "pen" | "touch" | "mouse";
function fire(
  el: HTMLElement, type: string, id: number, kind: Kind, x: number, y: number,
  extra: Partial<PointerEventInit> = {},
) {
  const e = new PointerEvent(type, {
    pointerId: id, pointerType: kind, clientX: x, clientY: y, button: 0, buttons: 1,
    pressure: kind === "pen" ? 0.6 : 0.5, bubbles: true, cancelable: true, ...extra,
  });
  el.dispatchEvent(e);
  return e;
}

describe("Editor input wiring", () => {
  let canvas: HTMLCanvasElement;
  let editor: Editor;

  beforeEach(() => {
    canvas = document.createElement("canvas");
    canvas.getContext = (() => fakeCtx()) as unknown as HTMLCanvasElement["getContext"];
    document.body.appendChild(canvas);
    editor = new Editor(canvas, {
      elements: [],
      renderer: { raf: () => 1, caf: () => {}, createPath: () => new FakePath() as unknown as Path2D },
    });
  });

  afterEach(() => {
    editor.destroy();
    canvas.remove();
  });

  it("a mouse drag adds one simulated-pressure stroke in world coordinates", () => {
    editor.camera.x = 100;
    editor.camera.y = 50;
    editor.camera.zoom = 2;
    fire(canvas, "pointerdown", 1, "mouse", 10, 10);
    fire(canvas, "pointermove", 1, "mouse", 20, 30);
    fire(canvas, "pointerup", 1, "mouse", 20, 30, { buttons: 0 });
    const all = editor.scene.all();
    expect(all).toHaveLength(1);
    const s = all[0] as StrokeEl;
    expect(s.simulatePressure).toBe(true);
    expect(s.points.map(([x, y]) => [x, y])).toEqual([[105, 55], [110, 65]]);
  });

  it("pen strokes keep the Pencil pressure, falling back to 0.5 when it reports 0", () => {
    fire(canvas, "pointerdown", 2, "pen", 0, 0, { pressure: 0 });
    fire(canvas, "pointermove", 2, "pen", 5, 5, { pressure: 0.8 });
    fire(canvas, "pointerup", 2, "pen", 5, 5, { pressure: 0 });
    const s = editor.scene.all()[0] as StrokeEl;
    expect(s.simulatePressure).toBe(false);
    expect(s.points[0][2]).toBe(0.5);
    expect(s.points[1][2]).toBeCloseTo(0.8);
  });

  it("uses the chosen colour and size", () => {
    editor.setColor("#dc2626");
    editor.setSize(8);
    fire(canvas, "pointerdown", 1, "mouse", 0, 0);
    fire(canvas, "pointerup", 1, "mouse", 0, 0);
    expect(editor.scene.all()[0]).toMatchObject({ color: "#dc2626", size: 8 });
  });

  it("a second touch arriving mid-stroke cancels the finger stroke", () => {
    fire(canvas, "pointerdown", 10, "touch", 0, 0);
    fire(canvas, "pointermove", 10, "touch", 10, 10);
    fire(canvas, "pointerdown", 11, "touch", 50, 50);
    fire(canvas, "pointermove", 10, "touch", 20, 20);
    fire(canvas, "pointerup", 10, "touch", 20, 20);
    fire(canvas, "pointerup", 11, "touch", 50, 50);
    expect(editor.scene.all()).toHaveLength(0);
  });

  it("palm touches never draw once a pen has been seen, and fingers pan", () => {
    fire(canvas, "pointerdown", 2, "pen", 0, 0);
    fire(canvas, "pointerup", 2, "pen", 0, 0);
    expect(editor.scene.all()).toHaveLength(1);
    fire(canvas, "pointerdown", 20, "touch", 100, 100);
    fire(canvas, "pointermove", 20, "touch", 130, 90);
    fire(canvas, "pointerup", 20, "touch", 130, 90);
    expect(editor.scene.all()).toHaveLength(1);
    expect(editor.camera.x).toBe(-30);
    expect(editor.camera.y).toBe(10);
  });

  it("a palm resting during a pen stroke neither draws nor pans", () => {
    fire(canvas, "pointerdown", 2, "pen", 0, 0);
    fire(canvas, "pointerdown", 30, "touch", 200, 200);
    fire(canvas, "pointermove", 2, "pen", 10, 10);
    fire(canvas, "pointermove", 30, "touch", 220, 230);
    fire(canvas, "pointerup", 2, "pen", 10, 10);
    fire(canvas, "pointermove", 30, "touch", 240, 260);
    fire(canvas, "pointerup", 30, "touch", 240, 260);
    expect(editor.scene.all()).toHaveLength(1);
    expect((editor.scene.all()[0] as StrokeEl).points).toHaveLength(2);
    expect([editor.camera.x, editor.camera.y]).toEqual([0, 0]);
  });

  it("a palm resting before the Pencil lands stops panning once the pen writes", () => {
    fire(canvas, "pointerdown", 2, "pen", 0, 0);
    fire(canvas, "pointerup", 2, "pen", 0, 0);
    fire(canvas, "pointerdown", 40, "touch", 300, 300);
    fire(canvas, "pointerdown", 3, "pen", 10, 10);
    fire(canvas, "pointermove", 40, "touch", 320, 340);
    fire(canvas, "pointermove", 3, "pen", 20, 20);
    fire(canvas, "pointermove", 40, "touch", 340, 360);
    fire(canvas, "pointerup", 3, "pen", 20, 20);
    fire(canvas, "pointermove", 40, "touch", 360, 380);
    fire(canvas, "pointerup", 40, "touch", 360, 380);
    expect([editor.camera.x, editor.camera.y]).toEqual([0, 0]);
    expect(editor.scene.all()).toHaveLength(2);
    expect((editor.scene.all()[1] as StrokeEl).points.map(([x, y]) => [x, y])).toEqual([[10, 10], [20, 20]]);
  });

  it("pointercancel discards the in-progress stroke", () => {
    fire(canvas, "pointerdown", 2, "pen", 0, 0);
    fire(canvas, "pointermove", 2, "pen", 10, 10);
    fire(canvas, "pointercancel", 2, "pen", 10, 10);
    expect(editor.scene.all()).toHaveLength(0);
  });

  it("reads coalesced events when the browser provides them", () => {
    fire(canvas, "pointerdown", 1, "mouse", 0, 0);
    const move = new PointerEvent("pointermove", { pointerId: 1, pointerType: "mouse", clientX: 3, clientY: 3, buttons: 1, bubbles: true });
    const coalesced = [1, 2, 3].map((v) => new PointerEvent("pointermove", { pointerId: 1, pointerType: "mouse", clientX: v, clientY: v }));
    Object.defineProperty(move, "getCoalescedEvents", { value: () => coalesced });
    canvas.dispatchEvent(move);
    fire(canvas, "pointerup", 1, "mouse", 3, 3);
    expect((editor.scene.all()[0] as StrokeEl).points.map(([x]) => x)).toEqual([0, 1, 2, 3]);
  });

  it("right-click does not draw", () => {
    fire(canvas, "pointerdown", 1, "mouse", 0, 0, { button: 2, buttons: 2 });
    fire(canvas, "pointerup", 1, "mouse", 0, 0, { button: 2, buttons: 0 });
    expect(editor.scene.all()).toHaveLength(0);
  });

  it("destroy() removes the listeners", () => {
    const spy = vi.spyOn(canvas, "removeEventListener");
    editor.destroy();
    expect(spy).toHaveBeenCalled();
    fire(canvas, "pointerdown", 1, "mouse", 0, 0);
    fire(canvas, "pointerup", 1, "mouse", 0, 0);
    expect(editor.scene.all()).toHaveLength(0);
  });
});

describe("Editor pan and zoom gestures", () => {
  let canvas: HTMLCanvasElement;
  let editor: Editor;

  beforeEach(() => {
    canvas = document.createElement("canvas");
    canvas.getContext = (() => fakeCtx()) as unknown as HTMLCanvasElement["getContext"];
    document.body.appendChild(canvas);
    editor = new Editor(canvas, {
      elements: [],
      renderer: { raf: () => 1, caf: () => {}, createPath: () => new FakePath() as unknown as Path2D },
    });
  });

  afterEach(() => {
    editor.destroy();
    canvas.remove();
  });

  const wheel = (init: WheelEventInit) => {
    const e = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
    canvas.dispatchEvent(e);
    return e;
  };

  it("two fingers moving apart zoom about their midpoint", () => {
    fire(canvas, "pointerdown", 1, "touch", 90, 100);
    fire(canvas, "pointerdown", 2, "touch", 110, 100);
    const before = editor.camera.screenToWorld(100, 100);
    fire(canvas, "pointermove", 1, "touch", 80, 100);
    fire(canvas, "pointermove", 2, "touch", 120, 100);
    expect(editor.camera.zoom).toBeCloseTo(2);
    const after = editor.camera.screenToWorld(100, 100);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
    expect(editor.scene.all()).toHaveLength(0);
  });

  it("going from two fingers to one continues as a pan without a jump", () => {
    fire(canvas, "pointerdown", 1, "touch", 100, 100);
    fire(canvas, "pointerdown", 2, "touch", 200, 100);
    fire(canvas, "pointermove", 2, "touch", 220, 100);
    fire(canvas, "pointerup", 1, "touch", 100, 100);
    const { x, y, zoom } = editor.camera;
    fire(canvas, "pointermove", 2, "touch", 220, 100);
    expect([editor.camera.x, editor.camera.y, editor.camera.zoom]).toEqual([x, y, zoom]);
    fire(canvas, "pointermove", 2, "touch", 230, 110);
    expect(editor.camera.x).toBeCloseTo(x - 10 / zoom);
    expect(editor.camera.y).toBeCloseTo(y - 10 / zoom);
    expect(editor.camera.zoom).toBe(zoom);
  });

  it("a second finger joining a one-finger pan starts a pinch without a jump", () => {
    fire(canvas, "pointerdown", 1, "touch", 0, 0);
    fire(canvas, "pointermove", 1, "touch", 10, 0);
    fire(canvas, "pointerdown", 2, "touch", 110, 0);
    const { x, y, zoom } = editor.camera;
    fire(canvas, "pointermove", 2, "touch", 110, 0);
    expect([editor.camera.x, editor.camera.y, editor.camera.zoom]).toEqual([x, y, zoom]);
  });

  it("ctrl+wheel zooms at the cursor", () => {
    editor.camera.x = 30;
    const before = editor.camera.screenToWorld(50, 60);
    const e = wheel({ ctrlKey: true, deltaY: -100, clientX: 50, clientY: 60 });
    expect(e.defaultPrevented).toBe(true);
    expect(editor.camera.zoom).toBeCloseTo(Math.exp(1));
    const after = editor.camera.screenToWorld(50, 60);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it("plain wheel pans", () => {
    const e = wheel({ deltaX: 5, deltaY: 20 });
    expect(e.defaultPrevented).toBe(true);
    expect([editor.camera.x, editor.camera.y]).toEqual([5, 20]);
    wheel({ deltaMode: 1, deltaY: 2 });
    expect(editor.camera.y).toBe(20 + 32);
  });

  it("space+drag pans with the mouse instead of drawing", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    fire(canvas, "pointerdown", 1, "mouse", 10, 10);
    fire(canvas, "pointermove", 1, "mouse", 25, 5);
    fire(canvas, "pointerup", 1, "mouse", 25, 5, { buttons: 0 });
    expect(editor.scene.all()).toHaveLength(0);
    expect([editor.camera.x, editor.camera.y]).toEqual([-15, 5]);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
    fire(canvas, "pointerdown", 2, "mouse", 0, 0);
    fire(canvas, "pointermove", 2, "mouse", 5, 5);
    fire(canvas, "pointerup", 2, "mouse", 5, 5, { buttons: 0 });
    expect(editor.scene.all()).toHaveLength(1);
  });

  it("space typed into an input does not switch to panning", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
    fire(canvas, "pointerdown", 1, "mouse", 0, 0);
    fire(canvas, "pointermove", 1, "mouse", 5, 5);
    fire(canvas, "pointerup", 1, "mouse", 5, 5, { buttons: 0 });
    input.remove();
    expect(editor.scene.all()).toHaveLength(1);
  });

  it("the hand tool makes mouse and pen drags pan", () => {
    editor.setTool("hand");
    expect(editor.tool).toBe("hand");
    fire(canvas, "pointerdown", 1, "mouse", 10, 10);
    fire(canvas, "pointermove", 1, "mouse", 20, 40);
    fire(canvas, "pointerup", 1, "mouse", 20, 40, { buttons: 0 });
    fire(canvas, "pointerdown", 2, "pen", 0, 0);
    fire(canvas, "pointermove", 2, "pen", 5, 5);
    fire(canvas, "pointerup", 2, "pen", 5, 5, { buttons: 0 });
    expect(editor.scene.all()).toHaveLength(0);
    expect([editor.camera.x, editor.camera.y]).toEqual([-15, -35]);
  });
});
