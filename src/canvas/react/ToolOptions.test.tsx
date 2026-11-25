import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Editor } from "../editor";
import { ToolOptions } from "./ToolOptions";

function makeEditor() {
  const canvas = document.createElement("canvas");
  const noop = () => {};
  const ctx = { setTransform: noop, fillRect: noop, fill: noop, fillText: noop, strokeRect: noop, setLineDash: noop, beginPath: noop, roundRect: noop, stroke: noop, save: noop, restore: noop, moveTo: noop, lineTo: noop, arc: noop };
  canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
  return new Editor(canvas, { elements: [], renderer: { raf: () => 0, caf: () => {}, createPath: () => ({}) as Path2D } });
}

let editor: Editor;
beforeEach(() => {
  localStorage.clear();
  editor = makeEditor();
});
afterEach(() => {
  cleanup();
  editor.destroy();
});

describe("ToolOptions", () => {
  it("shows a labelled size slider with SIZE_RANGE limits and a px readout", () => {
    render(<ToolOptions editor={editor} tool="pen" />);
    const slider = screen.getByRole("slider", { name: "Pen size" }) as HTMLInputElement;
    expect([slider.min, slider.max, slider.value]).toEqual(["1", "40", "3"]);
    expect(screen.getByText("3 px")).toBeTruthy();
  });

  it("slider changes update editor.settings and persist, per tool", () => {
    const { rerender } = render(<ToolOptions editor={editor} tool="pen" />);
    fireEvent.change(screen.getByRole("slider", { name: "Pen size" }), { target: { value: "12" } });
    expect(editor.settings.pen.size).toBe(12);
    expect(screen.getByText("12 px")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("ss.tools.v1") ?? "{}").pen.size).toBe(12);
    rerender(<ToolOptions editor={editor} tool="eraser" />);
    const slider = screen.getByRole("slider", { name: "Eraser size" }) as HTMLInputElement;
    expect([slider.min, slider.max, slider.value]).toEqual(["4", "80", "20"]);
    fireEvent.change(slider, { target: { value: "50" } });
    expect(editor.settings.eraser.size).toBe(50);
    expect(editor.settings.pen.size).toBe(12);
  });

  it("pen and highlighter show a preview dot sized and coloured from settings; eraser does not", () => {
    const { rerender } = render(<ToolOptions editor={editor} tool="highlighter" />);
    const dot = screen.getByTestId("size-preview");
    expect(dot.style.width).toBe("18px");
    expect(dot.style.height).toBe("18px");
    expect(dot.style.backgroundColor).toBe("rgb(244, 211, 94)");
    act(() => editor.updateSettings((s) => ({ ...s, highlighter: { ...s.highlighter, size: 30, color: "#8BE0A4" } })));
    expect(screen.getByTestId("size-preview").style.width).toBe("30px");
    rerender(<ToolOptions editor={editor} tool="eraser" />);
    expect(screen.queryByTestId("size-preview")).toBeNull();
  });

  it("offers the tool's colour presets and selecting one sets the colour (text uses the pen presets)", () => {
    const { rerender } = render(<ToolOptions editor={editor} tool="pen" />);
    const blue = screen.getByRole("button", { name: "Colour #2563EB" });
    expect(blue.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(blue);
    expect(editor.settings.pen.color).toBe("#2563EB");
    expect(screen.getByRole("button", { name: "Colour #2563EB" }).getAttribute("aria-pressed")).toBe("true");
    rerender(<ToolOptions editor={editor} tool="text" />);
    fireEvent.click(screen.getByRole("button", { name: "Colour #DC2626" }));
    expect(editor.settings.text.color).toBe("#DC2626");
    rerender(<ToolOptions editor={editor} tool="eraser" />);
    expect(screen.queryByRole("button", { name: /^Colour/ })).toBeNull();
  });
});
