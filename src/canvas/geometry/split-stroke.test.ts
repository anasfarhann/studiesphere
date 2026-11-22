import { describe, expect, it } from "vitest";
import type { StrokeEl } from "../model/types";
import { eraseFromStroke } from "./split-stroke";

function stroke(points: Array<[number, number]>): StrokeEl {
  return {
    id: "s", z: 3, updatedAt: 5, type: "stroke", tool: "pen", color: "#000", size: 4,
    points: points.map(([x, y]) => [x, y, 0.5]), simulatePressure: true,
  };
}
let n = 0;
const newId = () => `p${++n}`;

describe("eraseFromStroke", () => {
  it("erasing the middle of a straight stroke gives two pieces outside the radius", () => {
    const el = stroke([[0, 0], [100, 0]]);
    const out = eraseFromStroke(el, [50, 0], 10, newId);
    expect(out).toHaveLength(2);
    for (const piece of out) {
      expect(piece.id).not.toBe("s");
      expect(piece.z).toBe(3);
      for (const [x, y] of piece.points) expect(Math.hypot(x - 50, y)).toBeGreaterThanOrEqual(10);
    }
    expect(out[0].points[0][0]).toBe(0);
    expect(out[1].points.at(-1)![0]).toBe(100);
  });

  it("erasing nothing returns the same element", () => {
    const el = stroke([[0, 0], [100, 0]]);
    const out = eraseFromStroke(el, [50, 50], 10, newId);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(el);
  });

  it("erasing everything returns []", () => {
    const el = stroke([[0, 0], [5, 0], [10, 0]]);
    expect(eraseFromStroke(el, [5, 0], 50, newId)).toEqual([]);
  });

  it("erasing one end leaves one piece", () => {
    const el = stroke([[0, 0], [100, 0]]);
    const out = eraseFromStroke(el, [0, 0], 10, newId);
    expect(out).toHaveLength(1);
    expect(out[0].points[0][0]).toBeGreaterThanOrEqual(10);
  });

  it("a single-point stroke is erased or kept whole", () => {
    const el = stroke([[0, 0]]);
    expect(eraseFromStroke(el, [1, 0], 5, newId)).toEqual([]);
    expect(eraseFromStroke(el, [50, 0], 5, newId)).toEqual([el]);
  });
});
