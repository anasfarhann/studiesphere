import { describe, expect, it, vi } from "vitest";
import { Scene } from "../model/scene";
import type { CanvasElement } from "../model/types";
import { pickColorAt, type SampleSource } from "./eyedropper";

const stroke = (id: string, z: number, color: string, x = 0): CanvasElement => ({
  id, z, updatedAt: 1, type: "stroke", tool: "pen", color, size: 10, simulatePressure: false, points: [[x, 50, 0.5], [x + 100, 50, 0.5]],
});
const text = (id: string, z: number, color: string): CanvasElement => ({ id, z, updatedAt: 1, type: "text", x: 0, y: 0, w: 100, text: "hi", fontSize: 20, color });
const photo = (z: number, crop?: { x: number; y: number; w: number; h: number }): CanvasElement => ({ id: "img", z, updatedAt: 1, type: "image", x: 100, y: 100, w: 200, h: 100, assetPath: "a/b.jpg", crop });

/** A 1x1 canvas whose getImageData returns `rgba` and which records the drawImage source rect. */
function mockCanvas(rgba: number[]) {
  const draws: number[][] = [];
  const ctx = {
    drawImage: (_i: unknown, ...a: number[]) => void draws.push(a),
    getImageData: () => ({ data: Uint8ClampedArray.from(rgba) }),
  };
  const c = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { make: () => c, draws };
}
const ready = (tainted = false): SampleSource => ({ img: { width: 1000, height: 500 } as unknown as SampleSource["img"], tainted });

describe("pickColorAt", () => {
  it("takes the colour of the topmost stroke under the point", () => {
    const scene = new Scene([stroke("a", 1, "#111111"), stroke("b", 2, "#2563eb")]);
    expect(pickColorAt({ scene, x: 50, y: 50, reach: 4, image: () => null })).toEqual({ kind: "color", hex: "#2563eb" });
  });

  it("takes a text box's colour, and the topmost element wins", () => {
    const scene = new Scene([text("t", 1, "#dc2626"), stroke("s", 2, "#111111")]);
    expect(pickColorAt({ scene, x: 50, y: 50, reach: 4, image: () => null })).toEqual({ kind: "color", hex: "#111111" });
    expect(pickColorAt({ scene, x: 50, y: 10, reach: 4, image: () => null })).toEqual({ kind: "color", hex: "#dc2626" });
  });

  it("returns none on empty space, an unloaded photo and an audio card", () => {
    const scene = new Scene([photo(1), { id: "au", z: 2, updatedAt: 1, type: "audio", x: 600, y: 600, assetPath: "x", durationMs: 1 }]);
    expect(pickColorAt({ scene, x: 5, y: 5, reach: 4, image: () => null })).toEqual({ kind: "none" });
    expect(pickColorAt({ scene, x: 150, y: 150, reach: 4, image: () => null })).toEqual({ kind: "none" });
    expect(pickColorAt({ scene, x: 610, y: 610, reach: 4, image: () => ready() })).toEqual({ kind: "none" });
  });

  it("samples a photo's pixel at source coordinates through a 1x1 canvas", () => {
    const scene = new Scene([photo(1)]);
    const { make, draws } = mockCanvas([255, 128, 0, 255]);
    // Centre of the photo: half way across 1000 x 500 source pixels.
    expect(pickColorAt({ scene, x: 200, y: 150, reach: 4, image: () => ready(), makeCanvas: make })).toEqual({ kind: "color", hex: "#ff8000" });
    expect(draws[0]).toEqual([500, 250, 1, 1, 0, 0, 1, 1]);
  });

  it("honours the crop when mapping to source pixels", () => {
    const scene = new Scene([photo(1, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 })]);
    const { make, draws } = mockCanvas([1, 2, 3, 255]);
    pickColorAt({ scene, x: 100, y: 100, reach: 4, image: () => ready(), makeCanvas: make }); // top-left of the visible part
    expect(draws[0].slice(0, 4)).toEqual([500, 250, 1, 1]);
    pickColorAt({ scene, x: 300, y: 200, reach: 4, image: () => ready(), makeCanvas: make }); // bottom-right: clamped to the last pixel
    expect(draws[1].slice(0, 4)).toEqual([999, 499, 1, 1]);
  });

  it("reports unreadable for a tainted photo (without touching a canvas) or a read that throws; transparent is none", () => {
    const scene = new Scene([photo(1)]);
    const make = vi.fn();
    expect(pickColorAt({ scene, x: 200, y: 150, reach: 4, image: () => ready(true), makeCanvas: make })).toEqual({ kind: "unreadable" });
    expect(make).not.toHaveBeenCalled();
    const throwing = { width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: () => { throw new DOMException("x", "SecurityError"); } }) } as unknown as HTMLCanvasElement;
    expect(pickColorAt({ scene, x: 200, y: 150, reach: 4, image: () => ready(), makeCanvas: () => throwing })).toEqual({ kind: "unreadable" });
    expect(pickColorAt({ scene, x: 200, y: 150, reach: 4, image: () => ready(), makeCanvas: mockCanvas([9, 9, 9, 0]).make })).toEqual({ kind: "none" });
  });
});
