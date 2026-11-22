import { describe, expect, it } from "vitest";
import { Camera } from "../view/camera";
import { pinchUpdate } from "./pinch";

function apply(cam: Camera, r: ReturnType<typeof pinchUpdate>) {
  cam.panBy(r.panDx, r.panDy);
  cam.zoomAt(r.centerX, r.centerY, r.zoomFactor);
}

describe("pinchUpdate", () => {
  it("fingers moving apart 2x zoom about their midpoint", () => {
    const r = pinchUpdate([[90, 100], [110, 100]], [[80, 100], [120, 100]]);
    expect(r.zoomFactor).toBeCloseTo(2);
    expect([r.panDx, r.panDy]).toEqual([0, 0]);
    expect([r.centerX, r.centerY]).toEqual([100, 100]);
    const cam = new Camera();
    const before = cam.screenToWorld(100, 100);
    apply(cam, r);
    expect(cam.zoom).toBeCloseTo(2);
    expect(cam.screenToWorld(100, 100)[0]).toBeCloseTo(before[0]);
  });

  it("a parallel move is a pure pan", () => {
    const r = pinchUpdate([[0, 0], [10, 0]], [[30, 5], [40, 5]]);
    expect(r.zoomFactor).toBe(1);
    expect([r.panDx, r.panDy]).toEqual([30, 5]);
  });

  it("the world point under the old midpoint follows the new midpoint", () => {
    const cam = new Camera();
    const w = cam.screenToWorld(50, 50);
    apply(cam, pinchUpdate([[40, 50], [60, 50]], [[60, 70], [100, 70]]));
    const [sx, sy] = cam.worldToScreen(w[0], w[1]);
    expect(sx).toBeCloseTo(80);
    expect(sy).toBeCloseTo(70);
  });

  it("zoom never exceeds camera limits", () => {
    const cam = new Camera();
    for (let i = 0; i < 20; i++) apply(cam, pinchUpdate([[49, 0], [51, 0]], [[0, 0], [100, 0]]));
    expect(cam.zoom).toBe(Camera.MAX_ZOOM);
    for (let i = 0; i < 20; i++) apply(cam, pinchUpdate([[0, 0], [100, 0]], [[49, 0], [51, 0]]));
    expect(cam.zoom).toBe(Camera.MIN_ZOOM);
  });

  it("coincident fingers do not zoom", () => {
    expect(pinchUpdate([[5, 5], [5, 5]], [[0, 0], [10, 0]]).zoomFactor).toBe(1);
    expect(pinchUpdate([[0, 0], [10, 0]], [[5, 5], [5, 5]]).zoomFactor).toBe(1);
  });
});
