import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(localStorage.getItem("ss.tools.v1")).toBeNull(); // live value only; write is deferred
    fireEvent.pointerUp(screen.getByRole("slider", { name: "Pen size" }));
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

  it("debounces slider persistence to ~250 ms", () => {
    vi.useFakeTimers();
    try {
      render(<ToolOptions editor={editor} tool="pen" />);
      const slider = screen.getByRole("slider", { name: "Pen size" });
      for (const v of ["5", "6", "7"]) fireEvent.change(slider, { target: { value: v } });
      expect(editor.settings.pen.size).toBe(7);
      expect(localStorage.getItem("ss.tools.v1")).toBeNull();
      vi.advanceTimersByTime(260);
      expect(JSON.parse(localStorage.getItem("ss.tools.v1") ?? "{}").pen.size).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tapping the selected swatch opens the wheel; Add appends a deduped preset (max 12)", () => {
    render(<ToolOptions editor={editor} tool="pen" />);
    expect(screen.queryByRole("slider", { name: "Hue" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Colour #1B1A1F" })); // selected -> opens
    expect(screen.getByRole("slider", { name: "Hue" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Hex" }), { target: { value: "#00aa55" } });
    expect(editor.settings.pen.color).toBe("#00aa55");
    fireEvent.click(screen.getByRole("button", { name: "Add to presets" }));
    expect(editor.settings.pen.presets).toEqual(["#1B1A1F", "#2563EB", "#DC2626", "#00aa55"]);
    expect(screen.getByRole("button", { name: "Colour #00aa55" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add to presets" }));
    expect(screen.getByTestId("preset-message").textContent).toBe("Already in presets");
    expect(editor.settings.pen.presets).toHaveLength(4);
    for (let i = 0; i < 12; i++) {
      fireEvent.change(screen.getByRole("textbox", { name: "Hex" }), { target: { value: `#1000${i.toString(16).padStart(2, "0")}` } });
      fireEvent.click(screen.getByRole("button", { name: "Add to presets" }));
    }
    expect(editor.settings.pen.presets).toHaveLength(12);
    fireEvent.change(screen.getByRole("textbox", { name: "Hex" }), { target: { value: "#abcdef" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to presets" }));
    expect(screen.getByTestId("preset-message").textContent).toBe("Presets are full");
    expect(editor.settings.pen.presets).toHaveLength(12);
  });

  it("long press (500 ms) removes a non-default swatch with a live announcement; defaults are protected", () => {
    vi.useFakeTimers();
    try {
      act(() => editor.updateSettings((s) => ({ ...s, pen: { ...s.pen, presets: [...s.pen.presets, "#00aa55"] } })));
      render(<ToolOptions editor={editor} tool="pen" />);
      const press = (name: string, ms: number) => {
        const b = screen.getByRole("button", { name });
        fireEvent.pointerDown(b, { clientX: 5, clientY: 5 });
        act(() => void vi.advanceTimersByTime(ms));
        fireEvent.pointerUp(b);
      };
      press("Colour #DC2626", 600);
      expect(editor.settings.pen.presets).toContain("#DC2626");
      press("Colour #00aa55", 300);
      expect(editor.settings.pen.presets).toContain("#00aa55");
      press("Colour #00aa55", 600);
      expect(editor.settings.pen.presets).not.toContain("#00aa55");
      expect(screen.getByTestId("preset-message").textContent).toBe("Removed #00aa55 from presets");
    } finally {
      vi.useRealTimers();
    }
  });

  it("highlighter presets are separate; the wheel updates the current colour", () => {
    render(<ToolOptions editor={editor} tool="highlighter" />);
    fireEvent.click(screen.getByRole("button", { name: "Colour #F4D35E" }));
    fireEvent.keyDown(screen.getByRole("slider", { name: "Hue" }), { key: "ArrowRight" });
    expect(editor.settings.highlighter.color).not.toBe("#F4D35E");
    expect(editor.settings.pen.color).toBe("#1B1A1F");
  });

  it("Delete or Backspace on a focused custom swatch removes it; defaults stay", () => {
    act(() => editor.updateSettings((s) => ({ ...s, pen: { ...s.pen, presets: [...s.pen.presets, "#00aa55", "#aa0055"] } })));
    render(<ToolOptions editor={editor} tool="pen" />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Colour #DC2626" }), { key: "Delete" });
    expect(editor.settings.pen.presets).toContain("#DC2626");
    fireEvent.keyDown(screen.getByRole("button", { name: "Colour #00aa55" }), { key: "Delete" });
    expect(editor.settings.pen.presets).not.toContain("#00aa55");
    expect(screen.getByTestId("preset-message").textContent).toBe("Removed #00aa55 from presets");
    fireEvent.keyDown(screen.getByRole("button", { name: "Colour #aa0055" }), { key: "Backspace" });
    expect(editor.settings.pen.presets).not.toContain("#aa0055");
  });

  it("eraser shows a mode radio group that updates and persists the setting", () => {
    render(<ToolOptions editor={editor} tool="eraser" />);
    const group = screen.getByRole("radiogroup", { name: "Eraser mode" });
    expect(group).toBeTruthy();
    const whole = screen.getByRole("radio", { name: "Whole stroke" });
    const pixel = screen.getByRole("radio", { name: "Pixel" });
    expect([whole.getAttribute("aria-checked"), pixel.getAttribute("aria-checked")]).toEqual(["true", "false"]);
    fireEvent.click(pixel);
    expect(editor.settings.eraser.mode).toBe("pixel");
    expect(screen.getByRole("radio", { name: "Pixel" }).getAttribute("aria-checked")).toBe("true");
    expect(JSON.parse(localStorage.getItem("ss.tools.v1") ?? "{}").eraser.mode).toBe("pixel");
  });
});
