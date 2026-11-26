import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Editor } from "../editor";
import type { CanvasElement, StrokeEl } from "../model/types";
import { placeMenu, SelectionMenu } from "./SelectionMenu";

let frames: Array<() => void> = [];
const flush = () =>
  act(() => {
    for (let i = 0; i < 5 && frames.length > 0; i++) {
      const f = frames;
      frames = [];
      f.forEach((cb) => cb());
    }
  });

const ink = (id: string): StrokeEl => ({
  id, type: "stroke", tool: "pen", color: "#1B1A1F", size: 3, z: 1, updatedAt: 1, simulatePressure: true,
  points: [[200, 200, 0.5], [300, 220, 0.5]],
});
const elements: CanvasElement[] = [
  ink("a"),
  ink("b"),
  { id: "img", type: "image", x: 0, y: 0, w: 100, h: 100, assetPath: "o/p/i.png", z: 0, updatedAt: 1 },
  { id: "txt", type: "text", x: 400, y: 400, w: 100, text: "hello", fontSize: 20, color: "#1B1A1F", z: 2, updatedAt: 1 },
];

function makeEditor() {
  const canvas = document.createElement("canvas");
  const noop = () => {};
  const ctx = { setTransform: noop, fillRect: noop, fill: noop, fillText: noop, strokeRect: noop, setLineDash: noop, beginPath: noop, roundRect: noop, stroke: noop, save: noop, restore: noop, moveTo: noop, lineTo: noop, arc: noop, measureText: () => ({ width: 10 }) };
  canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
  return new Editor(canvas, { elements, renderer: { raf: (cb) => frames.push(cb), caf: () => {}, createPath: () => ({}) as Path2D } });
}

let editor: Editor;
beforeEach(() => {
  localStorage.clear();
  frames = [];
  editor = makeEditor();
  editor.setTool("lasso");
});
afterEach(() => {
  cleanup();
  editor.destroy();
});

const names = () => screen.queryAllByRole("button").map((b) => b.textContent);
function select(ids: string[]) {
  render(<SelectionMenu editor={editor} />);
  act(() => editor.selection.set(ids));
  flush();
}

describe("SelectionMenu actions per selection", () => {
  it("strokes only: Delete, Colour, Copy", () => {
    select(["a", "b"]);
    expect(names()).toEqual(["Delete", "Colour", "Copy"]);
  });

  it("one image: Crop, Delete, Copy (its corner handle resizes); Crop opens crop mode and hides the menu", () => {
    select(["img"]);
    expect(names()).toEqual(["Crop", "Delete", "Copy"]);
    fireEvent.click(screen.getByRole("button", { name: "Crop" }));
    expect(editor.crop.active).toBe(true);
    flush();
    expect(screen.queryByRole("toolbar", { name: "Selection actions" })).toBeNull();
  });

  it("one text: Edit, Aa, Delete, Copy; Edit opens the text editor", () => {
    select(["txt"]);
    expect(names()).toEqual(["Edit", "Aa", "Delete", "Copy"]);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(editor.text.session?.id).toBe("txt");
    flush();
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("Aa opens the text options for the selected box: a font or style tap restyles only it, in one undo step", () => {
    select(["txt"]);
    fireEvent.click(screen.getByRole("button", { name: "Text options" }));
    fireEvent.click(screen.getByRole("radio", { name: "Serif" }));
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    flush();
    expect(editor.scene.get("txt")).toMatchObject({ font: "serif", bold: true });
    expect((editor.scene.get("a") as { font?: string }).font).toBeUndefined();
    expect(screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("radio", { name: "Serif" }).getAttribute("aria-checked")).toBe("true");
    act(() => editor.undo());
    expect((editor.scene.get("txt") as { bold?: boolean }).bold).toBeFalsy();
  });

  it("mixed: Delete, Copy", () => {
    select(["a", "img"]);
    expect(names()).toEqual(["Delete", "Copy"]);
  });

  it("every action button is at least 44 px tall", () => {
    select(["a"]);
    for (const b of screen.getAllByRole("button")) expect(b.className).toMatch(/\bh-11\b/);
  });

  it("Delete removes the selection as one undo step", () => {
    select(["a", "img"]);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(editor.scene.get("a")).toBeUndefined();
    expect(editor.scene.get("img")).toBeUndefined();
    editor.undo();
    expect(editor.scene.all()).toHaveLength(4);
  });

  it("Colour shows the pen presets and recolours the strokes as one undo step", () => {
    select(["a", "b"]);
    fireEvent.click(screen.getByRole("button", { name: "Colour" }));
    fireEvent.click(screen.getByRole("button", { name: "Colour #DC2626" }));
    expect((editor.scene.get("a") as StrokeEl).color).toBe("#DC2626");
    expect((editor.scene.get("b") as StrokeEl).color).toBe("#DC2626");
    flush();
    expect(screen.getByRole("button", { name: "Colour #DC2626" }).getAttribute("aria-pressed")).toBe("true");
    editor.undo();
    expect((editor.scene.get("a") as StrokeEl).color).toBe("#1B1A1F");
    expect((editor.scene.get("b") as StrokeEl).color).toBe("#1B1A1F");
    expect(editor.canUndo()).toBe(false);
  });

  it("Copy puts the selection on the clipboard and says so", () => {
    select(["img"]);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(editor.clipboard.items()).toEqual([expect.objectContaining({ type: "image", x: 0, y: 0 })]);
  });
});

describe("Paste offer", () => {
  it("shows Paste after a tap on empty space when the clipboard has something, and pastes there", () => {
    render(<SelectionMenu editor={editor} />);
    editor.selection.set(["img"]);
    editor.copySelection();
    editor.selection.clear();
    const canvas = (editor as unknown as { canvas: HTMLCanvasElement }).canvas;
    act(() => {
      canvas.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, pointerType: "mouse", clientX: 600, clientY: 600, button: 0, buttons: 1, bubbles: true, cancelable: true }));
      canvas.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, pointerType: "mouse", clientX: 600, clientY: 600, button: 0, buttons: 0, bubbles: true, cancelable: true }));
    });
    flush();
    expect(names()).toEqual(["Paste"]);
    fireEvent.click(screen.getByRole("button", { name: "Paste" }));
    flush();
    const images = editor.scene.all().filter((e) => e.type === "image");
    expect(images).toHaveLength(2);
    expect(images[1]).toMatchObject({ x: 550, y: 550, assetPath: "o/p/i.png" });
    expect(names()).toEqual(["Crop", "Delete", "Copy"]); // the pasted copy is selected
  });

  it("shows nothing on an empty-space tap with an empty clipboard", () => {
    render(<SelectionMenu editor={editor} />);
    const canvas = (editor as unknown as { canvas: HTMLCanvasElement }).canvas;
    act(() => {
      canvas.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, pointerType: "mouse", clientX: 600, clientY: 600, button: 0, buttons: 1, bubbles: true, cancelable: true }));
      canvas.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, pointerType: "mouse", clientX: 600, clientY: 600, button: 0, buttons: 0, bubbles: true, cancelable: true }));
    });
    flush();
    expect(screen.queryByRole("toolbar")).toBeNull();
  });
});

describe("placeMenu", () => {
  const base = { menuW: 220, menuH: 56, viewW: 390, viewH: 844 };
  it("centres above the box when there is room", () => {
    expect(placeMenu({ ...base, centerX: 200, boxTop: 300, boxBottom: 400 })).toEqual({ left: 90, top: 236 });
  });
  it("stays inside the viewport horizontally at 390 px", () => {
    expect(placeMenu({ ...base, centerX: 10, boxTop: 300, boxBottom: 400 }).left).toBe(8);
    expect(placeMenu({ ...base, centerX: 385, boxTop: 300, boxBottom: 400 }).left).toBe(390 - 220 - 8);
  });
  it("goes below the box when there is no room above, and stays on screen", () => {
    expect(placeMenu({ ...base, centerX: 200, boxTop: 20, boxBottom: 100 }).top).toBe(108);
    expect(placeMenu({ ...base, centerX: 200, boxTop: 20, boxBottom: 840 }).top).toBe(8);
    expect(placeMenu({ ...base, centerX: 200, boxTop: 2000, boxBottom: 2100 }).top).toBe(844 - 56 - 8);
  });
  it("a menu wider than the view pins to the left gap", () => {
    expect(placeMenu({ ...base, menuW: 500, centerX: 200, boxTop: 300, boxBottom: 400 }).left).toBe(8);
  });
});
