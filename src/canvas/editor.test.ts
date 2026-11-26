import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "./editor";
import type { StrokeEl } from "./model/types";

function fakeCtx() {
  const noop = () => {};
  return {
    fillStyle: "", strokeStyle: "", globalAlpha: 1, lineWidth: 1, font: "", textBaseline: "",
    setTransform: noop, fillRect: noop, fill: noop, fillText: noop, strokeRect: noop, setLineDash: noop,
    beginPath: noop, roundRect: noop, stroke: noop, save: noop, restore: noop, moveTo: noop, lineTo: noop, arc: noop,
  };
}

class FakePath { moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {} }

let frames: Array<() => void> = [];
const flushFrames = () => {
  const f = frames;
  frames = [];
  f.forEach((cb) => cb());
};

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
    localStorage.clear();
    frames = [];
    canvas = document.createElement("canvas");
    canvas.getContext = (() => fakeCtx()) as unknown as HTMLCanvasElement["getContext"];
    document.body.appendChild(canvas);
    editor = new Editor(canvas, {
      elements: [],
      renderer: { raf: (cb: () => void) => frames.push(cb), caf: () => {}, createPath: () => new FakePath() as unknown as Path2D },
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
    editor.updateSettings((s) => ({ ...s, pen: { ...s.pen, color: "#dc2626", size: 8 } }));
    fire(canvas, "pointerdown", 1, "mouse", 0, 0);
    fire(canvas, "pointerup", 1, "mouse", 0, 0);
    expect(editor.scene.all()[0]).toMatchObject({ color: "#dc2626", size: 8 });
  });

  it("updateSettings persists, notifies, and the pen and highlighter keep separate sizes", () => {
    const seen = vi.fn();
    const off = editor.onSettingsChange(seen);
    editor.updateSettings((s) => ({ ...s, pen: { ...s.pen, size: 12 }, highlighter: { ...s.highlighter, size: 30 } }));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(editor.settings.pen.size).toBe(12);
    expect(JSON.parse(localStorage.getItem("ss.tools.v1") ?? "{}").pen.size).toBe(12);
    fire(canvas, "pointerdown", 1, "mouse", 0, 0);
    fire(canvas, "pointerup", 1, "mouse", 0, 0);
    editor.setTool("highlighter");
    fire(canvas, "pointerdown", 2, "mouse", 5, 5);
    fire(canvas, "pointerup", 2, "mouse", 5, 5);
    const [a, b] = editor.scene.all() as StrokeEl[];
    expect([a.tool, a.size, a.color]).toEqual(["pen", 12, "#1B1A1F"]);
    expect([b.tool, b.size, b.color]).toEqual(["highlighter", 30, "#F4D35E"]);
    off();
    editor.updateSettings((s) => s);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("updateSettings normalises, defers saves on request, and destroy flushes and drops listeners", () => {
    const seen = vi.fn();
    editor.onSettingsChange(seen);
    editor.updateSettings((s) => ({ ...s, pen: { ...s.pen, size: 500, color: "bad", presets: ["#00aa55"] } }));
    expect(editor.settings.pen).toMatchObject({ size: 40, color: "#1B1A1F", presets: ["#1B1A1F", "#2563EB", "#DC2626", "#00aa55"] });
    localStorage.clear();
    editor.updateSettings((s) => ({ ...s, pen: { ...s.pen, size: 9 } }), { deferSave: true });
    expect(editor.settings.pen.size).toBe(9);
    expect(localStorage.getItem("ss.tools.v1")).toBeNull();
    editor.destroy();
    expect(JSON.parse(localStorage.getItem("ss.tools.v1") ?? "{}").pen.size).toBe(9);
    const n = seen.mock.calls.length;
    editor.updateSettings((s) => ({ ...s, pen: { ...s.pen, size: 10 } }));
    expect(seen).toHaveBeenCalledTimes(n);
  });

  it("the eraser radius is size / 2 / zoom", () => {
    const stroke = (id: string, x: number): StrokeEl => ({ id, z: 0, updatedAt: 0, type: "stroke", tool: "pen", color: "#000", size: 2, points: [[x, 0, 0.5], [x + 1, 0, 0.5]], simulatePressure: true });
    editor.scene.add(stroke("near", 0));
    editor.scene.add(stroke("far", 15));
    editor.updateSettings((s) => ({ ...s, eraser: { ...s.eraser, size: 20 } }));
    editor.camera.zoom = 2; // radius 5 world units: reaches x=5, not x=15
    editor.setTool("eraser");
    fire(canvas, "pointerdown", 3, "mouse", 10, 0); // world x = 5 at zoom 2
    fire(canvas, "pointerup", 3, "mouse", 10, 0);
    expect(editor.scene.get("near")).toBeUndefined();
    expect(editor.scene.get("far")).toBeDefined();
    editor.updateSettings((s) => ({ ...s, eraser: { ...s.eraser, size: 80 } })); // radius 20
    fire(canvas, "pointerdown", 4, "mouse", 30, 0); // world x = 15
    fire(canvas, "pointerup", 4, "mouse", 30, 0);
    expect(editor.scene.get("far")).toBeUndefined();
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

describe("Editor history and eraser", () => {
  let canvas: HTMLCanvasElement;
  let editor: Editor;

  beforeEach(() => {
    localStorage.clear(); // settings persist across tests otherwise
    frames = [];
    canvas = document.createElement("canvas");
    canvas.getContext = (() => fakeCtx()) as unknown as HTMLCanvasElement["getContext"];
    document.body.appendChild(canvas);
    editor = new Editor(canvas, {
      elements: [],
      renderer: { raf: (cb: () => void) => frames.push(cb), caf: () => {}, createPath: () => new FakePath() as unknown as Path2D },
    });
  });
  afterEach(() => {
    editor.destroy();
    canvas.remove();
  });

  function drag(id: number, kind: Kind, pts: Array<[number, number]>, extra: Partial<PointerEventInit> = {}) {
    fire(canvas, "pointerdown", id, kind, pts[0][0], pts[0][1], extra);
    for (const [x, y] of pts.slice(1)) fire(canvas, "pointermove", id, kind, x, y, extra);
    fire(canvas, "pointerup", id, kind, pts.at(-1)![0], pts.at(-1)![1], { buttons: 0 });
  }

  describe("snap to shape", () => {
    const rect: Array<[number, number]> = [];
    for (const [ax, ay, bx, by] of [[0, 0, 200, 0], [200, 0, 200, 120], [200, 120, 0, 120], [0, 120, 0, 0]]) {
      for (let k = 1; k <= 20; k++) rect.push([ax + ((bx - ax) * k) / 20 + (k % 3) - 1, ay + ((by - ay) * k) / 20 - (k % 3) + 1]);
    }
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const drawHeld = (id: number, holdMs: number) => {
      fire(canvas, "pointerdown", id, "mouse", 0, 0);
      for (const [x, y] of rect) {
        vi.advanceTimersByTime(16);
        fire(canvas, "pointermove", id, "mouse", x, y);
      }
      vi.advanceTimersByTime(holdMs);
    };

    it("a 500 ms hold with snap on commits a clean closed shape as one undo step", () => {
      editor.updateSettings((s) => ({ ...s, pen: { ...s.pen, snap: true } }));
      drawHeld(1, 600);
      fire(canvas, "pointerup", 1, "mouse", 0, 0, { buttons: 0 });
      const all = editor.scene.all() as StrokeEl[];
      expect(all).toHaveLength(1);
      expect(all[0].points.at(-1)).toEqual(all[0].points[0]);
      expect(all[0].points.length).toBeGreaterThan(rect.length);
      editor.undo();
      expect(editor.scene.all()).toHaveLength(0);
      expect(editor.canUndo()).toBe(false);
    });

    it("snap is off by default, and switching tools mid-hold clears the ghost", () => {
      drawHeld(1, 600);
      fire(canvas, "pointerup", 1, "mouse", 0, 0, { buttons: 0 });
      expect((editor.scene.all()[0] as StrokeEl).points).toHaveLength(rect.length + 1);
      editor.updateSettings((s) => ({ ...s, highlighter: { ...s.highlighter, snap: true } }));
      editor.setTool("highlighter");
      const ghost = vi.spyOn((editor as unknown as { renderer: { setGhost(g: unknown): void } }).renderer, "setGhost");
      drawHeld(2, 600);
      expect(ghost).toHaveBeenLastCalledWith(expect.objectContaining({ tool: "highlighter" }));
      editor.setTool("pen");
      expect(ghost).toHaveBeenLastCalledWith(null);
      expect(editor.scene.all()).toHaveLength(1);
    });
  });

  it("Ctrl+Z undoes a stroke and Shift+Ctrl+Z redoes it", () => {
    drag(1, "mouse", [[10, 10], [60, 10]]);
    expect(editor.scene.all()).toHaveLength(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    expect(editor.scene.all()).toHaveLength(0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Z", ctrlKey: true, shiftKey: true, bubbles: true }));
    expect(editor.scene.all()).toHaveLength(1);
  });

  it("Cmd+Z is ignored while typing in an input", () => {
    drag(1, "mouse", [[10, 10], [60, 10]]);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }));
    expect(editor.scene.all()).toHaveLength(1);
    input.remove();
  });

  it("the highlighter tool draws highlighter strokes", () => {
    editor.setTool("highlighter");
    drag(1, "mouse", [[10, 10], [60, 10]]);
    expect((editor.scene.all()[0] as StrokeEl).tool).toBe("highlighter");
  });

  it("the eraser in whole-stroke mode removes a touched stroke in one undo step", () => {
    editor.updateSettings((s) => ({ ...s, eraser: { ...s.eraser, mode: "stroke" } }));
    drag(1, "mouse", [[0, 10], [200, 10]]);
    editor.setTool("eraser");
    drag(2, "mouse", [[100, 0], [100, 10], [100, 20]]);
    expect(editor.scene.all()).toHaveLength(0);
    editor.undo();
    expect(editor.scene.all()).toHaveLength(1);
  });

  it("the eraser splits a stroke in pixel mode (the default) and one drag is one undo step", () => {
    expect(editor.settings.eraser.mode).toBe("pixel");
    drag(1, "mouse", [[0, 10], [200, 10]]);
    editor.setTool("eraser");
    drag(2, "mouse", [[100, 0], [100, 10], [100, 20]]);
    expect(editor.scene.all()).toHaveLength(2);
    editor.undo();
    expect(editor.scene.all()).toHaveLength(1);
    editor.undo();
    expect(editor.scene.all()).toHaveLength(0);
  });

  it("the pen eraser button erases whatever tool is selected", () => {
    editor.updateSettings((s) => ({ ...s, eraser: { ...s.eraser, mode: "pixel" } }));
    drag(1, "mouse", [[0, 10], [200, 10]]);
    fire(canvas, "pointerdown", 2, "pen", 100, 10, { button: 5, buttons: 32 });
    fire(canvas, "pointerup", 2, "pen", 100, 10, { buttons: 0 });
    expect(editor.scene.all()).toHaveLength(2);
    expect(editor.scene.all().every((e) => e.id !== undefined)).toBe(true);
    expect(editor.tool).toBe("pen");
  });

  it("a quick two-finger tap undoes", () => {
    drag(1, "mouse", [[10, 10], [60, 10]]);
    fire(canvas, "pointerdown", 5, "touch", 100, 100);
    fire(canvas, "pointerdown", 6, "touch", 140, 100);
    fire(canvas, "pointerup", 5, "touch", 100, 100, { buttons: 0 });
    fire(canvas, "pointerup", 6, "touch", 140, 100, { buttons: 0 });
    expect(editor.scene.all()).toHaveLength(0);
  });

  it("two fingers that move or pinch do not undo", () => {
    drag(1, "mouse", [[10, 10], [60, 10]]);
    fire(canvas, "pointerdown", 5, "touch", 100, 100);
    fire(canvas, "pointerdown", 6, "touch", 140, 100);
    fire(canvas, "pointermove", 6, "touch", 200, 100);
    fire(canvas, "pointerup", 5, "touch", 100, 100, { buttons: 0 });
    fire(canvas, "pointerup", 6, "touch", 200, 100, { buttons: 0 });
    expect(editor.scene.all()).toHaveLength(1);
  });

  it("a slow two-finger touch does not undo", () => {
    vi.useFakeTimers();
    try {
      drag(1, "mouse", [[10, 10], [60, 10]]);
      fire(canvas, "pointerdown", 5, "touch", 100, 100);
      fire(canvas, "pointerdown", 6, "touch", 140, 100);
      vi.advanceTimersByTime(400);
      fire(canvas, "pointerup", 5, "touch", 100, 100, { buttons: 0 });
      fire(canvas, "pointerup", 6, "touch", 140, 100, { buttons: 0 });
      expect(editor.scene.all()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("onHistoryChange fires with undo/redo availability", () => {
    const seen: Array<[boolean, boolean]> = [];
    editor.onHistoryChange(() => seen.push([editor.canUndo(), editor.canRedo()]));
    drag(1, "mouse", [[10, 10], [60, 10]]);
    editor.undo();
    expect(seen).toEqual([[true, false], [false, true]]);
  });

  describe("lasso selection", () => {
    const seed = (id: string, x: number): StrokeEl => ({
      id, type: "stroke", tool: "pen", color: "#000", size: 2, z: 0, updatedAt: 1, simulatePressure: true,
      points: [[x, 10, 0.5], [x + 10, 20, 0.5], [x + 20, 30, 0.5]],
    });

    function lassoAround() {
      editor.scene.add(seed("a", 10));
      editor.scene.add(seed("far", 400));
      editor.setTool("lasso");
      fire(canvas, "pointerdown", 1, "mouse", 0, 0);
      fire(canvas, "pointermove", 1, "mouse", 100, 0);
      fire(canvas, "pointermove", 1, "mouse", 100, 100);
      fire(canvas, "pointermove", 1, "mouse", 0, 100);
      fire(canvas, "pointerup", 1, "mouse", 0, 100, { buttons: 0 });
    }

    it("selects, moves as one undo step, and notifies the overlay", () => {
      let n = 0;
      editor.onSelectionChange(() => n++);
      lassoAround();
      expect(editor.selection.ids).toEqual(["a"]);
      expect(editor.getSelectionBounds()).not.toBeNull();
      flushFrames();
      expect(n).toBeGreaterThan(0);
      fire(canvas, "pointerdown", 2, "mouse", 20, 20);
      fire(canvas, "pointermove", 2, "mouse", 30, 20);
      fire(canvas, "pointermove", 2, "mouse", 40, 25);
      fire(canvas, "pointerup", 2, "mouse", 40, 25, { buttons: 0 });
      expect((editor.scene.get("a") as StrokeEl).points[0]).toEqual([30, 15, 0.5]);
      expect(editor.scene.all()).toHaveLength(2);
      editor.undo();
      expect((editor.scene.get("a") as StrokeEl).points[0]).toEqual([10, 10, 0.5]);
      expect(editor.selection.ids).toEqual([]);
    });

    it("Delete key removes the selection in one undo step; ignored in inputs", () => {
      lassoAround();
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
      expect(editor.scene.get("a")).toBeDefined();
      input.remove();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
      expect(editor.scene.get("a")).toBeUndefined();
      expect(editor.selection.ids).toEqual([]);
      editor.undo();
      expect(editor.scene.get("a")).toBeDefined();
    });

    it("coalesces selection notifications to one per frame", () => {
      lassoAround();
      flushFrames();
      let n = 0;
      editor.onSelectionChange(() => n++);
      for (let i = 0; i < 5; i++) canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 10, bubbles: true, cancelable: true }));
      fire(canvas, "pointerdown", 7, "mouse", 5, 5, { buttons: 4 });
      expect(n).toBe(0);
      flushFrames();
      expect(n).toBe(1);
      flushFrames();
      expect(n).toBe(1);
    });

    it("changing tool away from lasso clears the selection", () => {
      lassoAround();
      editor.setTool("pen");
      expect(editor.selection.ids).toEqual([]);
    });

    it("selected elements erased elsewhere drop out of the selection", () => {
      lassoAround();
      editor.scene.remove("a");
      expect(editor.selection.ids).toEqual([]);
    });
  });

  describe("text styles", () => {
    const addText = (id: string, x: number) => {
      editor.scene.add({ id, z: editor.scene.nextZ(), updatedAt: 1, type: "text", x, y: 0, w: 100, text: id, fontSize: 18, color: "#000" });
    };

    it("a new box uses the text settings", () => {
      editor.updateSettings((s) => ({ ...s, text: { ...s.text, size: 40, color: "#2563EB", font: "serif", bold: true, italic: true, underline: true } }));
      editor.setTool("text");
      fire(canvas, "pointerdown", 1, "mouse", 30, 40);
      fire(canvas, "pointerup", 1, "mouse", 30, 40, { buttons: 0 });
      editor.text.commit("hi");
      expect(editor.scene.all()[0]).toMatchObject({ fontSize: 40, color: "#2563EB", font: "serif", bold: true, italic: true, underline: true });
    });

    it("restyling the selected box is one undo step and leaves other boxes alone", () => {
      addText("a", 0);
      addText("b", 200);
      editor.selection.set(["a"]);
      expect(editor.restyleText({ font: "mono" })).toBe(true);
      expect(editor.restyleText({ bold: true })).toBe(true);
      expect(editor.scene.get("a")).toMatchObject({ font: "mono", bold: true });
      expect((editor.scene.get("b") as { font?: string }).font).toBeUndefined();
      editor.undo();
      expect((editor.scene.get("a") as { bold?: boolean }).bold).toBeFalsy();
      expect(editor.scene.get("a")).toMatchObject({ font: "mono" });
      editor.undo();
      expect((editor.scene.get("a") as { font?: string }).font).toBeUndefined();
      expect(editor.canUndo()).toBe(false);
    });

    it("a live size drag is one undo step once committed", () => {
      addText("a", 0);
      editor.selection.set(["a"]);
      editor.restyleText({ fontSize: 24 }, { live: true });
      editor.restyleText({ fontSize: 30 }, { live: true });
      editor.commitTextStyle();
      expect((editor.scene.get("a") as { fontSize: number }).fontSize).toBe(30);
      editor.undo();
      expect((editor.scene.get("a") as { fontSize: number }).fontSize).toBe(18);
      expect(editor.canUndo()).toBe(false);
    });

    it("restyling an auto-width box recomputes its width; a fixed box keeps w", () => {
      editor.scene.add({ id: "auto", z: 1, updatedAt: 1, type: "text", x: 0, y: 0, w: 60, text: "hello", fontSize: 18, color: "#000", autoW: true });
      editor.scene.add({ id: "fix", z: 2, updatedAt: 1, type: "text", x: 0, y: 200, w: 60, text: "hello", fontSize: 18, color: "#000", autoW: false });
      editor.selection.set(["auto"]);
      editor.restyleText({ fontSize: 40 });
      const a = editor.scene.get("auto") as { w: number; autoW?: boolean };
      expect(a.w).toBeGreaterThan(100);
      expect(a.autoW).toBe(true);
      editor.undo();
      expect((editor.scene.get("auto") as { w: number }).w).toBe(60);
      editor.selection.set(["fix"]);
      editor.restyleText({ fontSize: 40, bold: true });
      expect(editor.scene.get("fix")).toMatchObject({ w: 60, autoW: false, fontSize: 40 });
      // "hello" in bold 40px (approx 0.55em x 1.06 per char) is ~117 wide: it wraps in 60.
      expect((editor.scene.get("fix") as { lines?: number }).lines).toBeGreaterThan(1);
    });

    it("with several elements selected, or none, restyle does nothing", () => {
      addText("a", 0);
      addText("b", 200);
      expect(editor.restyleText({ bold: true })).toBe(false);
      editor.selection.set(["a", "b"]);
      expect(editor.restyleText({ bold: true })).toBe(false);
      expect(editor.canUndo()).toBe(false);
    });

    it("while editing an existing box a style change is its own step, then the text edit another", () => {
      addText("a", 0);
      editor.text.beginEdit("a");
      editor.restyleText({ italic: true });
      expect(editor.textStyle()).toMatchObject({ italic: true, fontSize: 18 });
      editor.text.commit("a2");
      expect(editor.scene.get("a")).toMatchObject({ italic: true, text: "a2" });
      editor.undo();
      expect(editor.scene.get("a")).toMatchObject({ italic: true, text: "a" });
      editor.undo();
      expect((editor.scene.get("a") as { italic?: boolean }).italic).toBeFalsy();
    });

    it("while typing in a new box the change styles the pending box", () => {
      editor.setTool("text");
      editor.text.beginAt(5, 5);
      expect(editor.restyleText({ font: "hand", fontSize: 50 })).toBe(true);
      editor.text.commit("new");
      expect(editor.scene.all()[0]).toMatchObject({ font: "hand", fontSize: 50 });
      expect(editor.canUndo()).toBe(true);
      editor.undo();
      expect(editor.scene.all()).toHaveLength(0);
    });
  });

  describe("text tool", () => {
    it("tap with the text tool opens a session on pointer up; typed text commits on the next canvas press", () => {
      editor.setTool("text");
      fire(canvas, "pointerdown", 1, "mouse", 30, 40);
      expect(editor.text.session).toBeNull();
      fire(canvas, "pointerup", 1, "mouse", 30, 40, { buttons: 0 });
      expect(editor.text.session).toMatchObject({ id: null, x: 30, y: 40 });
      editor.text.commit("hi");
      expect(editor.scene.all()).toHaveLength(1);
      editor.undo();
      expect(editor.scene.all()).toHaveLength(0);
    });

    it("double tap on a text box edits it even with the pen tool, without drawing", () => {
      editor.setTool("text");
      fire(canvas, "pointerdown", 1, "mouse", 30, 40);
      fire(canvas, "pointerup", 1, "mouse", 30, 40, { buttons: 0 });
      editor.text.commit("hi");
      editor.setTool("pen");
      const now = vi.spyOn(Date, "now");
      const t0 = Date.now();
      now.mockReturnValue(t0 + 2000); // not a double tap with the creating tap
      fire(canvas, "pointerdown", 2, "mouse", 35, 45);
      fire(canvas, "pointerup", 2, "mouse", 35, 45, { buttons: 0 });
      const strokes = editor.scene.all().length;
      now.mockReturnValue(t0 + 2100);
      fire(canvas, "pointerdown", 3, "mouse", 35, 45);
      fire(canvas, "pointerup", 3, "mouse", 35, 45, { buttons: 0 });
      expect(editor.text.session).toMatchObject({ id: expect.any(String), text: "hi" });
      expect(editor.scene.all().length).toBe(strokes - 1); // the first tap's dot is gone
      now.mockRestore();
    });

    it("pen double tap on a text box leaves no dot and only the edit step", () => {
      editor.setTool("text");
      fire(canvas, "pointerdown", 1, "mouse", 30, 40);
      fire(canvas, "pointerup", 1, "mouse", 30, 40, { buttons: 0 });
      editor.text.commit("hi");
      editor.setTool("pen");
      const now = vi.spyOn(Date, "now");
      const t0 = Date.now();
      now.mockReturnValue(t0 + 2000);
      fire(canvas, "pointerdown", 2, "mouse", 35, 45);
      fire(canvas, "pointerup", 2, "mouse", 35, 45, { buttons: 0 });
      expect(editor.scene.all().filter((e) => e.type === "stroke")).toHaveLength(1); // the first tap's dot
      now.mockReturnValue(t0 + 2100);
      fire(canvas, "pointerdown", 3, "mouse", 35, 45);
      expect(editor.scene.all().filter((e) => e.type === "stroke")).toHaveLength(0);
      fire(canvas, "pointerup", 3, "mouse", 35, 45, { buttons: 0 });
      editor.text.commit("hi there");
      expect(editor.scene.all()).toHaveLength(1);
      editor.undo(); // the edit
      expect((editor.scene.all()[0] as { text: string }).text).toBe("hi");
      editor.undo(); // the creation: no dot step in between
      expect(editor.scene.all()).toHaveLength(0);
      expect(editor.canUndo()).toBe(false);
      now.mockRestore();
    });

    it("Undo with a text box still open commits the typed text first, so redo brings it back", () => {
      editor.setTool("text");
      fire(canvas, "pointerdown", 1, "mouse", 30, 40);
      fire(canvas, "pointerup", 1, "mouse", 30, 40, { buttons: 0 });
      editor.text.draft("typed, not blurred");
      editor.undo(); // toolbar tap: no blur on iPad Safari
      expect(editor.text.session).toBeNull();
      expect(editor.scene.all()).toHaveLength(0);
      editor.redo();
      expect(editor.scene.all().map((e) => (e as { text?: string }).text)).toEqual(["typed, not blurred"]);
    });

    it("Redo with a text box open commits the typed text first", () => {
      editor.setTool("text");
      fire(canvas, "pointerdown", 1, "mouse", 30, 40);
      fire(canvas, "pointerup", 1, "mouse", 30, 40, { buttons: 0 });
      editor.text.draft("draft");
      editor.redo();
      expect(editor.text.session).toBeNull();
      expect(editor.scene.all().map((e) => (e as { text?: string }).text)).toEqual(["draft"]);
    });

    it("open text is committed when the page is hidden", () => {
      editor.setTool("text");
      fire(canvas, "pointerdown", 1, "mouse", 30, 40);
      fire(canvas, "pointerup", 1, "mouse", 30, 40, { buttons: 0 });
      editor.text.draft("typed");
      window.dispatchEvent(new Event("pagehide"));
      expect(editor.scene.all()).toHaveLength(1);
    });

    it("Delete, Backspace and Cmd+Z are left to the textarea while typing", () => {
      editor.setTool("text");
      fire(canvas, "pointerdown", 1, "mouse", 30, 40);
      fire(canvas, "pointerup", 1, "mouse", 30, 40, { buttons: 0 });
      editor.text.commit("hi");
      const ta = document.createElement("textarea");
      document.body.appendChild(ta);
      const keys = ["Delete", "Backspace"].map((key) => new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      const undo = new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true, cancelable: true });
      for (const k of [...keys, undo]) ta.dispatchEvent(k);
      expect(undo.defaultPrevented).toBe(false);
      expect(editor.scene.all()).toHaveLength(1);
      ta.remove();
    });
  });
});

describe("Editor lasso: tap to select, copy and paste, recolour", () => {
  let canvas: HTMLCanvasElement;
  let editor: Editor;
  const img = { id: "img", type: "image" as const, x: 0, y: 0, w: 100, h: 100, assetPath: "o/p/i.png", z: 0, updatedAt: 1 };
  const ink = (id: string, y: number): StrokeEl => ({
    id, type: "stroke", tool: "pen", color: "#1B1A1F", size: 3, z: 1, updatedAt: 1, simulatePressure: true,
    points: [[200, y, 0.5], [300, y, 0.5]],
  });
  const tap = (id: number, kind: Kind, x: number, y: number) => {
    fire(canvas, "pointerdown", id, kind, x, y);
    fire(canvas, "pointerup", id, kind, x, y, { buttons: 0 });
  };

  beforeEach(() => {
    localStorage.clear();
    frames = [];
    canvas = document.createElement("canvas");
    canvas.getContext = (() => fakeCtx()) as unknown as HTMLCanvasElement["getContext"];
    document.body.appendChild(canvas);
    editor = new Editor(canvas, {
      elements: [img, ink("a", 200), ink("b", 220)],
      renderer: { raf: (cb: () => void) => frames.push(cb), caf: () => {}, createPath: () => new FakePath() as unknown as Path2D },
    });
    editor.setTool("lasso");
  });

  afterEach(() => {
    editor.destroy();
    canvas.remove();
  });

  it("a tap selects the element under it; a tap on empty space offers Paste only with a clipboard", () => {
    tap(1, "mouse", 50, 50);
    expect(editor.selection.ids).toEqual(["img"]);
    tap(1, "mouse", 600, 600);
    expect(editor.selection.ids).toEqual([]);
    expect(editor.getPasteAnchor()).toBeNull();
    tap(1, "mouse", 50, 50);
    editor.copySelection();
    tap(1, "mouse", 600, 600);
    expect(editor.getPasteAnchor()).toEqual([600, 600]);
    const ids = editor.paste();
    expect(editor.getPasteAnchor()).toBeNull();
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toBe("img");
    expect(editor.scene.get(ids[0])).toMatchObject({ type: "image", x: 550, y: 550, assetPath: "o/p/i.png" });
    expect(editor.selection.ids).toEqual(ids);
    editor.undo();
    expect(editor.scene.all()).toHaveLength(3);
  });

  it("palm touches neither select nor offer or withdraw Paste while the Pencil is active", () => {
    tap(1, "pen", 50, 50);
    editor.copySelection();
    tap(1, "pen", 600, 600);
    expect(editor.getPasteAnchor()).toEqual([600, 600]);
    tap(2, "touch", 50, 50); // a palm on the image
    expect(editor.selection.ids).toEqual([]);
    expect(editor.getPasteAnchor()).toEqual([600, 600]);
    // A palm resting while the Pencil taps empty space.
    fire(canvas, "pointerdown", 3, "touch", 50, 50);
    tap(4, "pen", 700, 700);
    fire(canvas, "pointerup", 3, "touch", 50, 50, { buttons: 0 });
    expect(editor.selection.ids).toEqual([]);
    expect(editor.getPasteAnchor()).toEqual([700, 700]);
  });

  it("recolouring selected strokes is one undo step, including a live wheel drag", () => {
    editor.selection.set(["a", "b", "img"]);
    editor.recolorSelection("#2563EB");
    expect((editor.scene.get("a") as StrokeEl).color).toBe("#2563EB");
    expect((editor.scene.get("b") as StrokeEl).color).toBe("#2563EB");
    editor.recolorSelection("#111111", { live: true });
    editor.recolorSelection("#222222", { live: true });
    editor.commitRecolor();
    expect((editor.scene.get("a") as StrokeEl).color).toBe("#222222");
    editor.undo();
    expect((editor.scene.get("a") as StrokeEl).color).toBe("#2563EB");
    editor.undo();
    expect((editor.scene.get("a") as StrokeEl).color).toBe("#1B1A1F");
    expect((editor.scene.get("b") as StrokeEl).color).toBe("#1B1A1F");
    expect(editor.canUndo()).toBe(false);
  });

  it("a single selected image resizes from its corner handle straight away", () => {
    tap(1, "mouse", 50, 50);
    expect(editor.selection.ids).toEqual(["img"]);
    fire(canvas, "pointerdown", 1, "mouse", 100, 100);
    fire(canvas, "pointermove", 1, "mouse", 200, 200);
    fire(canvas, "pointerup", 1, "mouse", 200, 200, { buttons: 0 });
    expect(editor.scene.get("img")).toMatchObject({ x: 0, y: 0, w: 200, h: 200 });
  });
});

describe("Editor image select and crop", () => {
  let editor: Editor;
  const photo = { id: "p", type: "image", x: 100, y: 100, w: 200, h: 100, assetPath: "a", z: 1, updatedAt: 1 } as const;
  beforeEach(() => {
    localStorage.clear();
    frames = [];
    const canvas = document.createElement("canvas");
    canvas.getContext = (() => fakeCtx()) as unknown as HTMLCanvasElement["getContext"];
    document.body.appendChild(canvas);
    editor = new Editor(canvas, {
      elements: [photo],
      renderer: { raf: (cb: () => void) => frames.push(cb), caf: () => {}, createPath: () => new FakePath() as unknown as Path2D },
    });
  });
  afterEach(() => editor.destroy());

  it("selectInserted switches to lasso with the photo selected and reports the tool change", () => {
    const tools: string[] = [];
    editor.onToolChange((t) => tools.push(t));
    editor.setTool("pen");
    editor.selectInserted("p");
    expect(editor.tool).toBe("lasso");
    expect(editor.selection.ids).toEqual(["p"]);
    expect(tools).toEqual(["pen", "lasso"]);
  });

  it("selectInserted waits for a stroke in progress instead of cutting it", () => {
    const c = document.querySelector("canvas:last-of-type") as HTMLCanvasElement;
    fire(c, "pointerdown", 1, "mouse", 600, 600);
    editor.selectInserted("p");
    expect(editor.tool).toBe("pen");
    fire(c, "pointerup", 1, "mouse", 600, 600);
    expect(editor.tool).toBe("lasso");
    expect(editor.selection.ids).toEqual(["p"]);
  });

  function crop() {
    editor.setTool("lasso");
    editor.selection.set(["p"]);
    expect(editor.beginCrop()).toBe(true);
  }

  it("Done commits one undo step; undo/redo restore", () => {
    crop();
    expect(editor.cropDragBegin("e", 1, "mouse", 300, 150)).toBe(true);
    editor.cropDragMove(1, 200, 150);
    editor.cropDragEnd(1);
    editor.crop.done();
    expect(editor.scene.get("p")).toMatchObject({ w: 100, crop: { x: 0, y: 0, w: 0.5, h: 1 } });
    editor.undo();
    expect((editor.scene.get("p") as { crop?: unknown }).crop).toBeUndefined();
    expect(editor.scene.get("p")).toMatchObject({ w: 200 });
    editor.redo();
    expect(editor.scene.get("p")).toMatchObject({ w: 100 });
  });

  it("beforeRestore abandons an open crop", () => {
    crop();
    editor.beforeRestore();
    expect(editor.crop.active).toBe(false);
    expect(editor.scene.get("p")).toEqual(photo);
  });

  it("Cancel, switching tools, and undo during crop all abandon it unchanged", () => {
    crop();
    editor.crop.cancel();
    expect(editor.scene.get("p")).toEqual(photo);
    crop();
    editor.setTool("pen");
    expect(editor.crop.active).toBe(false);
    crop();
    editor.undo();
    expect(editor.crop.active).toBe(false);
    expect(editor.scene.get("p")).toEqual(photo);
    expect(editor.canUndo()).toBe(false);
  });

  it("with the Pencil in use a finger cannot drag a crop handle; the Pencil can, one pointer at a time", () => {
    crop();
    editor.router.penSeen = true;
    expect(editor.cropDragBegin("e", 7, "touch", 300, 150)).toBe(false);
    expect(editor.cropDragBegin("e", 8, "pen", 300, 150)).toBe(true);
    expect(editor.cropDragBegin("w", 9, "pen", 100, 150)).toBe(false);
    editor.cropDragEnd(8);
  });

  it("the canvas does not draw while cropping", () => {
    crop();
    const c = document.querySelector("canvas:last-of-type") as HTMLCanvasElement;
    fire(c, "pointerdown", 1, "mouse", 600, 600);
    fire(c, "pointermove", 1, "mouse", 650, 650);
    fire(c, "pointerup", 1, "mouse", 650, 650);
    expect(editor.scene.all().filter((e) => e.type === "stroke")).toHaveLength(0);
  });

  it("a photo removed during crop ends it", () => {
    crop();
    editor.scene.remove("p");
    expect(editor.crop.active).toBe(false);
  });

  it("a late selectInserted does not cancel a crop in progress or touch the tool", () => {
    editor.setTool("lasso");
    editor.selection.set(["p"]);
    editor.beginCrop();
    editor.selectInserted("p");
    expect(editor.crop.active).toBe(true);
    expect(editor.tool).toBe("lasso");
  });

  it("interactionStamp changes on tool and selection changes; a pending select is dropped by a tool switch", () => {
    const a = editor.interactionStamp();
    editor.setTool("highlighter");
    const b = editor.interactionStamp();
    expect(b).not.toBe(a);
    editor.setTool("lasso");
    editor.selection.set(["p"]);
    expect(editor.interactionStamp()).not.toBe(b);
    const c = document.querySelector("canvas:last-of-type") as HTMLCanvasElement;
    editor.setTool("pen");
    fire(c, "pointerdown", 1, "mouse", 600, 600);
    editor.selectInserted("p");
    editor.setTool("highlighter");
    fire(c, "pointerup", 1, "mouse", 600, 600);
    expect(editor.tool).toBe("highlighter");
  });

  it("undoing a crop that removed the crop key deletes it (no undefined left behind)", () => {
    crop();
    editor.crop.reset();
    editor.crop.done();
    expect("crop" in (editor.scene.get("p") as object)).toBe(false);
  });
});

describe("font-load re-measure", () => {
  let canvas: HTMLCanvasElement;
  let editor: Editor;
  let loaded: boolean;
  let k: number;
  let resolveLoad: () => void;
  const realFonts = Object.getOwnPropertyDescriptor(document, "fonts");

  beforeEach(() => {
    localStorage.clear();
    frames = [];
    loaded = false;
    k = 10;
    let pending: Array<() => void> = [];
    resolveLoad = () => {
      loaded = true;
      const p = pending;
      pending = [];
      p.forEach((fn) => fn());
    };
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { check: () => loaded, load: () => new Promise<void>((r) => pending.push(r)) },
    });
    canvas = document.createElement("canvas");
    const ctx = { ...fakeCtx(), measureText: (str: string) => ({ width: str.length * k }) };
    canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
    document.body.appendChild(canvas);
    editor = new Editor(canvas, {
      elements: [
        // Viewed only: stored w/lines differ from what this device measures.
        { id: "seen", z: 1, updatedAt: 1, type: "text", x: 0, y: 300, w: 999, text: "hello", fontSize: 18, color: "#000", autoW: true },
        { id: "seen2", z: 2, updatedAt: 1, type: "text", x: 0, y: 400, w: 40, text: "hello there", fontSize: 18, color: "#000", autoW: false, lines: 1 },
      ],
      renderer: { raf: (cb: () => void) => frames.push(cb), caf: () => {}, createPath: () => new FakePath() as unknown as Path2D },
    });
  });
  afterEach(() => {
    editor.destroy();
    canvas.remove();
    if (realFonts) Object.defineProperty(document, "fonts", realFonts);
    else delete (document as unknown as { fonts?: unknown }).fonts;
  });

  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("never writes boxes that were only viewed, whatever their stored w/lines", async () => {
    flushFrames(); // draws them: asks for the face
    editor.scene.takeDirty();
    expect(editor.remeasureTexts()).toBe(0);
    resolveLoad();
    await settle();
    expect(editor.remeasureTexts()).toBe(0);
    expect(editor.scene.takeDirty().upserts).toEqual([]);
    expect(editor.scene.get("seen")).toMatchObject({ w: 999, updatedAt: 1 });
    expect("lines" in editor.scene.get("seen")!).toBe(false);
  });

  it("a box committed before its face loaded is re-measured once, silently", async () => {
    editor.text.beginAt(0, 0);
    editor.text.commit("abcdefghij");
    const id = editor.scene.all().find((e) => e.type === "text" && e.text === "abcdefghij")!.id;
    const w0 = (editor.scene.get(id) as { w: number }).w;
    expect(w0).toBeGreaterThanOrEqual(100);
    k = 14; // the real face is wider than the fallback
    editor.scene.takeDirty();
    resolveLoad();
    await settle();
    const after = editor.scene.get(id) as { w: number };
    expect(after.w).toBeGreaterThan(w0 + 30);
    expect(editor.scene.takeDirty().upserts.map((e) => e.id)).toEqual([id]);
    expect(editor.canRedo()).toBe(false);
    editor.undo(); // the creation, not the re-measure
    expect(editor.scene.get(id)).toBeUndefined();
    expect(editor.remeasureTexts()).toBe(0); // once only
  });

  it("skips a re-measure within 2 units and the same line count", async () => {
    editor.text.beginAt(0, 0);
    editor.text.commit("abcdefghij");
    editor.scene.takeDirty();
    k = 10.15; // 10 chars: +1.5 units
    resolveLoad();
    await settle();
    expect(editor.scene.takeDirty().upserts).toEqual([]);
  });
});
