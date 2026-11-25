import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorWheel } from "./ColorWheel";

afterEach(cleanup);

function Harness({ start = "#ff0000", spy }: { start?: string; spy?: (hex: string) => void }) {
  const [v, setV] = useState(start);
  return <ColorWheel value={v} onChange={(h) => { setV(h); spy?.(h); }} />;
}
const rect = (el: HTMLElement, x: number, y: number, w: number, h: number) =>
  (el.getBoundingClientRect = () => ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} }) as DOMRect);

describe("ColorWheel", () => {
  it("arrow keys move the hue handle", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    const hue = screen.getByRole("slider", { name: "Hue" });
    fireEvent.keyDown(hue, { key: "ArrowRight", shiftKey: true });
    expect(hue.getAttribute("aria-valuenow")).toBe("10");
    expect(spy).toHaveBeenLastCalledWith("#ff2a00");
  });

  it("arrow keys move saturation and brightness", () => {
    render(<Harness start="#ff0000" />);
    const sv = screen.getByRole("slider", { name: "Saturation and brightness" });
    fireEvent.keyDown(sv, { key: "ArrowLeft", shiftKey: true });
    expect(sv.getAttribute("aria-valuenow")).toBe("90");
    fireEvent.keyDown(sv, { key: "ArrowDown", shiftKey: true });
    expect(sv.getAttribute("aria-valuetext")).toBe("Saturation 90%, brightness 90%");
  });

  it("picking on the square sets the colour from the pointer position", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    const sv = screen.getByRole("slider", { name: "Saturation and brightness" });
    rect(sv, 0, 0, 100, 100);
    fireEvent.pointerDown(sv, { clientX: 100, clientY: 0, pointerId: 1, button: 0 });
    expect(spy).toHaveBeenLastCalledWith("#ff0000");
    fireEvent.pointerMove(sv, { clientX: 0, clientY: 0, pointerId: 1 });
    expect(spy).toHaveBeenLastCalledWith("#ffffff");
    fireEvent.pointerUp(sv, { pointerId: 1 });
    fireEvent.pointerMove(sv, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(spy).toHaveBeenLastCalledWith("#ffffff");
  });

  it("picking on the ring sets the hue from the angle and ignores the box corners", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    const hue = screen.getByRole("slider", { name: "Hue" });
    rect(hue, 0, 0, 200, 200);
    fireEvent.pointerDown(hue, { clientX: 195, clientY: 100, pointerId: 1, button: 0 }); // 3 o'clock = 90deg
    expect(spy).toHaveBeenLastCalledWith("#80ff00");
    spy.mockClear();
    fireEvent.pointerDown(hue, { clientX: 1, clientY: 1, pointerId: 2, button: 0 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignores pointer-downs in the hole inside the ring", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    const hue = screen.getByRole("slider", { name: "Hue" });
    rect(hue, 0, 0, 248, 248); // ring spans radius 80..124
    fireEvent.pointerDown(hue, { clientX: 124 + 60, clientY: 124, pointerId: 3, button: 0 }); // radius 60
    expect(spy).not.toHaveBeenCalled();
    fireEvent.pointerDown(hue, { clientX: 124 + 100, clientY: 124, pointerId: 4, button: 0 }); // radius 100, on the ring
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("the hex field applies 6 digits immediately, 3-digit shorthand only on blur or Enter, and follows the wheel", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    const input = screen.getByRole("textbox", { name: "Hex" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "#00aa5" } });
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "#00AA55" } });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith("#00aa55");
    spy.mockClear();
    fireEvent.change(input, { target: { value: "#0af" } });
    expect(spy).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(spy).toHaveBeenLastCalledWith("#00aaff");
    spy.mockClear();
    fireEvent.change(input, { target: { value: "f00" } });
    expect(spy).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(spy).toHaveBeenLastCalledWith("#ff0000");
    spy.mockClear();
    fireEvent.change(input, { target: { value: "#12" } });
    fireEvent.blur(input);
    expect(spy).not.toHaveBeenCalled();
    expect(input.value).toBe("#ff0000");
    fireEvent.keyDown(screen.getByRole("slider", { name: "Hue" }), { key: "ArrowRight" });
    expect(input.value).not.toBe("#ff0000");
    expect(input.value).toMatch(/^#[0-9a-f]{6}$/);
  });
});
