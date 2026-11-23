import { describe, expect, it } from "vitest";
import { Camera } from "./camera";

describe("Camera", () => {
  it("defaults to origin at zoom 1", () => {
    const cam = new Camera();
    expect([cam.x, cam.y, cam.zoom]).toEqual([0, 0, 1]);
  });

  it("round-trips screen -> world -> screen", () => {
    const cam = new Camera(120, -45, 2.5);
    const [wx, wy] = cam.screenToWorld(333, 217);
    const [sx, sy] = cam.worldToScreen(wx, wy);
    expect(sx).toBeCloseTo(333, 9);
    expect(sy).toBeCloseTo(217, 9);
  });

  it("maps world to screen with camera x/y as the top-left world point", () => {
    const cam = new Camera(10, 20, 2);
    expect(cam.worldToScreen(10, 20)).toEqual([0, 0]);
    expect(cam.worldToScreen(12, 23)).toEqual([4, 6]);
    expect(cam.screenToWorld(4, 6)).toEqual([12, 23]);
  });

  it("zoomAt keeps the world point under the anchor fixed", () => {
    const cam = new Camera();
    const before = cam.screenToWorld(100, 100);
    cam.zoomAt(100, 100, 2);
    expect(cam.zoom).toBe(2);
    const after = cam.screenToWorld(100, 100);
    expect(after[0]).toBeCloseTo(before[0], 9);
    expect(after[1]).toBeCloseTo(before[1], 9);
  });

  it("clamps zoom to MIN_ZOOM and MAX_ZOOM and keeps the anchor fixed", () => {
    expect(Camera.MIN_ZOOM).toBe(0.1);
    expect(Camera.MAX_ZOOM).toBe(8);

    const cam = new Camera();
    cam.zoomAt(50, 60, 1000);
    expect(cam.zoom).toBe(8);
    // The world point that was under (50, 60) before zooming is still there.
    expect(cam.screenToWorld(50, 60)[0]).toBeCloseTo(50, 9);
    expect(cam.screenToWorld(50, 60)[1]).toBeCloseTo(60, 9);

    const low = new Camera(0, 0, 1);
    low.zoomAt(200, 200, 0.0001);
    expect(low.zoom).toBe(0.1);
    const [wx, wy] = low.screenToWorld(200, 200);
    expect(wx).toBeCloseTo(200, 9);
    expect(wy).toBeCloseTo(200, 9);
  });

  it("panBy moves the content with the finger", () => {
    const cam = new Camera(0, 0, 2);
    cam.panBy(20, -10);
    expect(cam.x).toBeCloseTo(-10, 9);
    expect(cam.y).toBeCloseTo(5, 9);
    // A point on screen moves by the same finger delta.
    expect(cam.worldToScreen(0, 0)).toEqual([20, -10]);
  });

  it("ignores a zoomAt factor that is non-finite or not positive", () => {
    for (const factor of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const cam = new Camera(3, 4, 1.5);
      cam.zoomAt(10, 10, factor);
      expect([cam.x, cam.y, cam.zoom]).toEqual([3, 4, 1.5]);
    }
  });

  it("viewRect at zoom 2 is half the size of zoom 1", () => {
    const at1 = new Camera(0, 0, 1).viewRect(800, 600);
    const at2 = new Camera(0, 0, 2).viewRect(800, 600);
    expect(at2.maxX - at2.minX).toBeCloseTo((at1.maxX - at1.minX) / 2, 9);
    expect(at2.maxY - at2.minY).toBeCloseTo((at1.maxY - at1.minY) / 2, 9);
    expect(at2).toEqual({ minX: 0, minY: 0, maxX: 400, maxY: 300 });
  });
});
