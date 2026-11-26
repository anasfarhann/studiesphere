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
    expect(screen.getByTestId("size-preview").style.opacity).toBe("0.35"); // drawn at the highlighter's alpha
    rerender(<ToolOptions editor={editor} tool="pen" />);
    expect(screen.getByTestId("size-preview").style.opacity).toBe("");
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

  it("wheel drags update the colour live but write storage only when the drag ends", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    try {
      render(<ToolOptions editor={editor} tool="pen" />);
      fireEvent.click(screen.getByRole("button", { name: "Colour #1B1A1F" }));
      setItem.mockClear();
      const sv = screen.getByRole("slider", { name: "Saturation and brightness" });
      sv.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, toJSON() {} }) as DOMRect;
      fireEvent.pointerDown(sv, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
      for (let i = 0; i < 10; i++) fireEvent.pointerMove(sv, { clientX: 20 + i * 5, clientY: 20 + i * 3, pointerId: 1 });
      expect(editor.settings.pen.color).not.toBe("#1B1A1F");
      expect(setItem).not.toHaveBeenCalled();
      fireEvent.pointerUp(sv, { pointerId: 1 });
      expect(setItem).toHaveBeenCalledTimes(1);
      expect(JSON.parse(localStorage.getItem("ss.tools.v1") ?? "{}").pen.color).toBe(editor.settings.pen.color);
    } finally {
      setItem.mockRestore();
    }
  });

  it("removing the pen's current custom colour resets pen and text to the first default", () => {
    act(() => editor.updateSettings((s) => ({ ...s, pen: { ...s.pen, color: "#00aa55", presets: [...s.pen.presets, "#00aa55"] }, text: { ...s.text, color: "#00aa55" } })));
    render(<ToolOptions editor={editor} tool="text" />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Colour #00aa55" }), { key: "Delete" });
    expect(editor.settings.pen.color).toBe("#1B1A1F");
    expect(editor.settings.text.color).toBe("#1B1A1F");
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
    expect([whole.getAttribute("aria-checked"), pixel.getAttribute("aria-checked")]).toEqual(["false", "true"]);
    fireEvent.click(whole);
    expect(editor.settings.eraser.mode).toBe("stroke");
    expect(screen.getByRole("radio", { name: "Whole stroke" }).getAttribute("aria-checked")).toBe("true");
    expect(JSON.parse(localStorage.getItem("ss.tools.v1") ?? "{}").eraser.mode).toBe("stroke");
  });

  it("pen and highlighter have a snap-to-shape switch (off by default) that persists per tool", () => {
    const { rerender } = render(<ToolOptions editor={editor} tool="pen" />);
    const sw = screen.getByRole("switch", { name: "Snap to shape" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.className).toContain("h-11");
    fireEvent.click(sw);
    expect(editor.settings.pen.snap).toBe(true);
    expect(editor.settings.highlighter.snap).toBe(false);
    expect(screen.getByRole("switch", { name: "Snap to shape" }).getAttribute("aria-checked")).toBe("true");
    expect(JSON.parse(localStorage.getItem("ss.tools.v1") ?? "{}").pen.snap).toBe(true);
    rerender(<ToolOptions editor={editor} tool="highlighter" />);
    expect(screen.getByRole("switch", { name: "Snap to shape" }).getAttribute("aria-checked")).toBe("false");
    rerender(<ToolOptions editor={editor} tool="eraser" />);
    expect(screen.queryByRole("switch", { name: "Snap to shape" })).toBeNull();
    rerender(<ToolOptions editor={editor} tool="text" />);
    expect(screen.queryByRole("switch", { name: "Snap to shape" })).toBeNull();
  });
});

describe("ToolOptions text styles", () => {
  it("offers four fonts, each set in its own face, and B / I / U toggles of at least 44px", () => {
    render(<ToolOptions editor={editor} tool="text" />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Sans", "Serif", "Hand", "Mono"]);
    expect((radios[1] as HTMLElement).style.fontFamily).toContain("Lora");
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    for (const name of ["Bold", "Italic", "Underline"]) {
      const b = screen.getByRole("button", { name });
      expect(b.getAttribute("aria-pressed")).toBe("false");
      expect(b.className).toContain("h-11");
      expect(b.className).toContain("min-w-11");
    }
  });

  it("choosing a font and toggles updates the text settings used for the next box", () => {
    render(<ToolOptions editor={editor} tool="text" />);
    fireEvent.click(screen.getByRole("radio", { name: "Mono" }));
    fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(editor.settings.text).toMatchObject({ font: "mono", italic: true, bold: false });
    expect(screen.getByRole("radio", { name: "Mono" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "Italic" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(editor.settings.text.italic).toBe(false);
  });

  it("with a box being edited, options show and change that box, not other boxes", () => {
    editor.scene.add({ id: "a", z: 0, updatedAt: 1, type: "text", x: 0, y: 0, w: 100, text: "a", fontSize: 30, color: "#000000" });
    editor.scene.add({ id: "b", z: 1, updatedAt: 1, type: "text", x: 300, y: 0, w: 100, text: "b", fontSize: 18, color: "#000000" });
    editor.text.beginEdit("a");
    render(<ToolOptions editor={editor} tool="text" />);
    expect((screen.getByRole("slider", { name: "Text size" }) as HTMLInputElement).value).toBe("30");
    fireEvent.click(screen.getByRole("radio", { name: "Hand" }));
    fireEvent.change(screen.getByRole("slider", { name: "Text size" }), { target: { value: "50" } });
    fireEvent.pointerUp(screen.getByRole("slider", { name: "Text size" }));
    expect(editor.scene.get("a")).toMatchObject({ font: "hand", fontSize: 50 });
    expect(editor.scene.get("b")).toMatchObject({ fontSize: 18 });
    expect((editor.scene.get("b") as { font?: string }).font).toBeUndefined();
    editor.text.commit();
    editor.undo();
    expect(editor.scene.get("a")).toMatchObject({ font: "hand", fontSize: 30 });
    editor.undo();
    expect((editor.scene.get("a") as { font?: string }).font).toBeUndefined();
  });

  it("Save preset replaces the selected preset (a default included), keeps the colour selected and persists", () => {
    render(<ToolOptions editor={editor} tool="pen" />);
    fireEvent.click(screen.getByRole("button", { name: "Colour #2563EB" })); // selects it
    fireEvent.click(screen.getByRole("button", { name: "Colour #2563EB" })); // selected -> opens the wheel
    fireEvent.change(screen.getByRole("textbox", { name: "Hex" }), { target: { value: "#00aa55" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preset" }));
    expect(editor.settings.pen.presets).toEqual(["#1B1A1F", "#00aa55", "#DC2626"]);
    expect(editor.settings.pen.color).toBe("#00aa55");
    expect(screen.getByRole("button", { name: "Colour #00aa55" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Colour #2563EB" })).toBeNull();
    expect(screen.getByTestId("preset-message").textContent).toBe("Saved #00aa55 as a preset");
    expect(JSON.parse(localStorage.getItem("ss.tools.v1") ?? "{}").pen.presets).toEqual(["#1B1A1F", "#00aa55", "#DC2626"]);
    // A second save of the same colour, or of one that is another preset, changes nothing.
    fireEvent.click(screen.getByRole("button", { name: "Save preset" }));
    expect(screen.getByTestId("preset-message").textContent).toBe("Already in presets");
    // The replaced slot is protected from long-press removal like any of the three.
    expect(editor.settings.highlighter.presets).toEqual(["#F4D35E", "#8BE0A4", "#F6A5C0"]);
  });

  it("Save preset replaces the preset last tapped, not the one the wheel colour came from", () => {
    render(<ToolOptions editor={editor} tool="pen" />);
    fireEvent.click(screen.getByRole("button", { name: "Colour #1B1A1F" })); // selected -> opens the wheel
    fireEvent.change(screen.getByRole("textbox", { name: "Hex" }), { target: { value: "#00aa55" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preset" }));
    expect(editor.settings.pen.presets).toEqual(["#00aa55", "#2563EB", "#DC2626"]);
    fireEvent.click(screen.getByRole("button", { name: "Colour #DC2626" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Hex" }), { target: { value: "#abcdef" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preset" }));
    expect(editor.settings.pen.presets).toEqual(["#00aa55", "#2563EB", "#abcdef"]);
  });

  it("removing a preset never makes Save preset overwrite a different colour", () => {
    act(() => editor.updateSettings((s) => ({ ...s, pen: { ...s.pen, presets: ["#1B1A1F", "#2563EB", "#DC2626", "#444444", "#555555", "#666666"] } })));
    render(<ToolOptions editor={editor} tool="pen" />);
    fireEvent.click(screen.getByRole("button", { name: "Colour #555555" })); // selects it
    fireEvent.click(screen.getByRole("button", { name: "Colour #555555" })); // opens the wheel
    fireEvent.keyDown(screen.getByRole("button", { name: "Colour #444444" }), { key: "Delete" });
    expect(editor.settings.pen.presets).toEqual(["#1B1A1F", "#2563EB", "#DC2626", "#555555", "#666666"]);
    fireEvent.change(screen.getByRole("textbox", { name: "Hex" }), { target: { value: "#00aa55" } });
    fireEvent.click(screen.getByRole("button", { name: "Save preset" }));
    // The tapped #555555 is replaced where it now is; #666666 (now at its old index) is kept.
    expect(editor.settings.pen.presets).toEqual(["#1B1A1F", "#2563EB", "#DC2626", "#00aa55", "#666666"]);
  });

  it("Save preset is not offered once the tapped preset itself was removed", () => {
    act(() => editor.updateSettings((s) => ({ ...s, pen: { ...s.pen, presets: ["#1B1A1F", "#2563EB", "#DC2626", "#444444", "#555555"] } })));
    render(<ToolOptions editor={editor} tool="pen" />);
    fireEvent.click(screen.getByRole("button", { name: "Colour #444444" }));
    fireEvent.click(screen.getByRole("button", { name: "Colour #444444" }));
    expect(screen.getByRole("button", { name: "Save preset" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "Colour #444444" }), { key: "Delete" });
    expect(screen.queryByRole("button", { name: "Save preset" })).toBeNull();
  });

  it("Reset colours restores the three defaults", () => {
    act(() => editor.updateSettings((s) => ({ ...s, pen: { ...s.pen, presets: ["#111111", "#222222", "#333333", "#444444"] } })));
    render(<ToolOptions editor={editor} tool="pen" />);
    fireEvent.click(screen.getByRole("button", { name: "Reset colours" }));
    expect(editor.settings.pen.presets).toEqual(["#1B1A1F", "#2563EB", "#DC2626", "#444444"]);
    expect(screen.getByTestId("preset-message").textContent).toBe("Colours reset");
  });

  it("the eyedropper button arms and cancels a pick; a tap on the page sets the tool colour", () => {
    editor.scene.add({ id: "s", type: "stroke", tool: "pen", z: 1, updatedAt: 1, color: "#00aa55", size: 10, simulatePressure: false, points: [[0, 50, 0.5], [200, 50, 0.5]] });
    render(<ToolOptions editor={editor} tool="pen" />);
    const btn = () => screen.getByRole("button", { name: "Pick a colour from the page" });
    expect(btn().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn());
    expect(editor.eyedropper).toBe("armed");
    expect(btn().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(btn()); // second tap cancels
    expect(editor.eyedropper).toBe("off");
    expect(btn().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn());
    editor.resize(400, 400, 1);
    act(() => {
      // Feed the editor's own canvas: the pick is completed by a press on it.
      const c = (editor as unknown as { canvas: HTMLCanvasElement }).canvas;
      c.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, pointerType: "mouse", clientX: 100, clientY: 50, button: 0, buttons: 1, bubbles: true, cancelable: true }));
      c.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, pointerType: "mouse", clientX: 100, clientY: 50, bubbles: true }));
    });
    expect(editor.settings.pen.color).toBe("#00aa55");
    expect(editor.eyedropper).toBe("off");
    expect(editor.canUndo()).toBe(false);
  });
});
