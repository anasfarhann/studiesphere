import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Editor } from "../editor";
import { CropOverlay } from "./CropOverlay";

let frames: Array<() => void> = [];
const flush = () =>
  act(() => {
    for (let i = 0; i < 5 && frames.length > 0; i++) {
      const f = frames;
      frames = [];
      f.forEach((cb) => cb());
    }
  });

let editor: Editor;
let canvas: HTMLCanvasElement;
beforeEach(() => {
  localStorage.clear();
  frames = [];
  canvas = document.createElement("canvas");
  const noop = () => {};
  const ctx = { setTransform: noop, fillRect: noop, fill: noop, strokeRect: noop, setLineDash: noop, beginPath: noop, roundRect: noop, stroke: noop, save: noop, restore: noop, moveTo: noop, lineTo: noop, arc: noop };
  canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
  document.body.appendChild(canvas);
  editor = new Editor(canvas, {
    elements: [{ id: "p", type: "image", x: 100, y: 100, w: 200, h: 100, assetPath: "a", z: 1, updatedAt: 1 }],
    renderer: { raf: (cb) => frames.push(cb), caf: () => {}, createPath: () => ({}) as Path2D },
  });
  editor.resize(400, 400, 1);
  editor.setTool("lasso");
  editor.selection.set(["p"]);
});
afterEach(() => {
  cleanup();
  editor.destroy();
  canvas.remove();
});

describe("CropOverlay", () => {
  it("follows a pan and a zoom while cropping", () => {
    render(<CropOverlay editor={editor} />);
    act(() => void editor.beginCrop());
    flush();
    const left = () => parseFloat(screen.getByTestId("crop-rect").style.left);
    const width = () => parseFloat(screen.getByTestId("crop-rect").style.width);
    expect(left()).toBe(100);
    act(() => void canvas.dispatchEvent(new WheelEvent("wheel", { deltaX: 30, deltaY: 0, cancelable: true })));
    flush();
    expect(left()).toBe(70);
    act(() => void canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -50, ctrlKey: true, cancelable: true })));
    flush();
    expect(width()).toBeGreaterThan(200);
  });

  it("keeps handles inside the view when the image extends past it", () => {
    render(<CropOverlay editor={editor} />);
    act(() => void editor.beginCrop());
    act(() => editor.camera.panBy(-380, 0));
    act(() => void canvas.dispatchEvent(new WheelEvent("wheel", { deltaX: 0, deltaY: 0, cancelable: true })));
    flush();
    // The east edge is now at x=580 > 400 wide view: its 44 px target is pulled back inside.
    const e = screen.getByTestId("crop-handle-e");
    expect(parseFloat(e.style.left) + 44).toBeLessThanOrEqual(400);
  });
});
