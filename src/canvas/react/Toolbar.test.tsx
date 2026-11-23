import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toolbar, type ToolbarProps } from "./Toolbar";

afterEach(cleanup);

const base: ToolbarProps = {
  tool: "pen", onTool: vi.fn(), color: "#111827", size: 4, onColor: vi.fn(), onSize: vi.fn(),
  canUndo: true, canRedo: false, onUndo: vi.fn(), onRedo: vi.fn(),
};

describe("Toolbar (canvas top bar)", () => {
  it("lets pointer events through the bar and only catches them on the pills", () => {
    render(<Toolbar {...base} left={<span>Title pill</span>} status={<span>Saved</span>} />);
    const bar = screen.getByTestId("canvas-topbar");
    expect(bar.className).toMatch(/pointer-events-none/);
    const toolbar = screen.getByRole("toolbar", { name: "Drawing tools" });
    expect(toolbar.className).toMatch(/pointer-events-auto/);
    expect(screen.getByText("Title pill").closest(".pointer-events-auto")).not.toBeNull();
    expect(screen.getByText("Saved").closest(".pointer-events-auto")).not.toBeNull();
    // the bar itself never carries pointer-events-auto
    expect(bar.className).not.toMatch(/pointer-events-auto/);
  });

  it("keeps every tool, colour and size reachable by name with pressed state", () => {
    render(<Toolbar {...base} onPhoto={vi.fn()} onFile={vi.fn()} onRecord={vi.fn()} onHistory={vi.fn()} />);
    const toolbar = screen.getByRole("toolbar", { name: "Drawing tools" });
    for (const n of ["Pen", "Highlighter", "Eraser", "Select (lasso)", "Text", "Hand (pan)", "Photo", "File", "Record"]) {
      expect(within(toolbar).getByRole("button", { name: n })).toBeTruthy();
    }
    expect(within(toolbar).getAllByRole("button", { pressed: true }).map((b) => b.getAttribute("aria-label"))).toEqual(["Pen", "Black", "Medium"]);
    expect(screen.getByRole("button", { name: "Page history" })).toBeTruthy();
    expect(within(toolbar).getAllByRole("button").every((b) => b.className.includes("touch-manipulation"))).toBe(true);
  });

  it("undo/redo/history live in the right cluster and keep behaviour", () => {
    const onUndo = vi.fn();
    const onHistory = vi.fn();
    render(<Toolbar {...base} onUndo={onUndo} onHistory={onHistory} />);
    const undo = screen.getByRole("button", { name: "Undo" });
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("toolbar", { name: "Drawing tools" }).contains(undo)).toBe(false);
    expect(undo.className).toMatch(/touch-manipulation/);
  });
});
