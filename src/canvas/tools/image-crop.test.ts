import { describe, expect, it, vi } from "vitest";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { ImageEl } from "../model/types";
import { applyCrop, dragCrop, fullFrame, ImageCrop, MIN_CROP, validCrop, CROP_HANDLE_HIT_PX } from "./image-crop";

const img: ImageEl = { id: "i", z: 0, updatedAt: 1, type: "image", x: 100, y: 100, w: 200, h: 100, assetPath: "a" };

function setup(el: ImageEl = img) {
  const scene = new Scene([el]);
  const history = new History();
  const preview = vi.fn();
  const crop = new ImageCrop({ scene, history, preview, onChange: () => {} });
  return { scene, history, crop, preview };
}

describe("crop math", () => {
  it("dragging an edge moves only that edge and clamps to the source", () => {
    const c = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    expect(dragCrop(c, "e", -0.1, 9)).toEqual({ x: 0.2, y: 0.2, w: 0.5, h: 0.6 });
    expect(dragCrop(c, "e", 5, 0).w).toBeCloseTo(0.8);
    expect(dragCrop(c, "w", -5, 0)).toMatchObject({ x: 0, w: 0.8 });
    const n = dragCrop(c, "n", 0, 0.1);
    expect(n.y).toBeCloseTo(0.3);
    expect(n.h).toBeCloseTo(0.5);
    expect(dragCrop(c, "s", 0, 5).h).toBeCloseTo(0.8);
  });

  it("never goes below 5% per axis, with the opposite edge fixed", () => {
    const c = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    const e = dragCrop(c, "e", -5, 0);
    expect(e.w).toBe(MIN_CROP);
    const w = dragCrop(c, "w", 5, 0);
    expect(w.w).toBeCloseTo(MIN_CROP);
    expect(w.x + w.w).toBeCloseTo(0.8);
    const se = dragCrop(c, "se", -5, -5);
    expect(se.w).toBe(MIN_CROP);
    expect(se.h).toBe(MIN_CROP);
  });

  it("corners move two edges", () => {
    const r = dragCrop({ x: 0, y: 0, w: 1, h: 1 }, "nw", 0.25, 0.5);
    expect(r).toEqual({ x: 0.25, y: 0.5, w: 0.75, h: 0.5 });
  });

  it("applyCrop keeps the visible region where it was drawn", () => {
    const a = applyCrop(img, { x: 0.5, y: 0, w: 0.5, h: 1 });
    expect(a).toMatchObject({ x: 200, y: 100, w: 100, h: 100, crop: { x: 0.5, y: 0, w: 0.5, h: 1 } });
    // Re-crop an already cropped image: the source frame stays put.
    expect(fullFrame(a)).toEqual({ x: 100, y: 100, w: 200, h: 100 });
    const b = applyCrop(a, { x: 0.5, y: 0.5, w: 0.25, h: 0.5 });
    expect(b).toMatchObject({ x: 200, y: 150, w: 50, h: 50 });
  });

  it("applyCrop with the full crop restores the whole image at the same scale", () => {
    const a = applyCrop(img, { x: 0.5, y: 0.25, w: 0.25, h: 0.5 });
    const r = applyCrop(a, { x: 0, y: 0, w: 1, h: 1 });
    expect(r).toMatchObject({ x: 100, y: 100, w: 200, h: 100 });
    expect(r.crop).toBeUndefined();
    expect("crop" in r).toBe(false);
  });

  it("validCrop rejects malformed crops", () => {
    expect(validCrop({ x: 0, y: 0, w: 1, h: 1 })).not.toBeNull();
    expect(validCrop({ x: 0.9, y: 0, w: 0.5, h: 1 })).toBeNull();
    expect(validCrop({ x: 0, y: 0, w: 0.01, h: 1 })).toBeNull();
    expect(validCrop({ x: NaN, y: 0, w: 1, h: 1 })).toBeNull();
    expect(validCrop(undefined)).toBeNull();
  });

  it("handles have a 44 px touch target", () => {
    expect(CROP_HANDLE_HIT_PX).toBeGreaterThanOrEqual(44);
  });
});

describe("ImageCrop session", () => {
  it("shows the whole source while open and leaves the scene alone until Done", () => {
    const cropped = applyCrop(img, { x: 0.5, y: 0, w: 0.5, h: 1 });
    const { scene, crop, preview } = setup(cropped);
    expect(crop.begin("i")).toBe(true);
    expect(preview).toHaveBeenCalledWith({ id: "i", x: 100, y: 100, w: 200, h: 100 });
    expect(crop.state()?.draft).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
    expect(scene.get("i")).toMatchObject({ x: 200, w: 100 });
  });

  it("drag the right edge left then Done: crop set, one undo step, undo/redo restore", () => {
    const { scene, history, crop } = setup();
    crop.begin("i");
    expect(crop.beginDrag("e", 1, 300, 150)).toBe(true);
    crop.moveDrag(1, 250, 150);
    crop.endDrag(1);
    crop.done();
    const el = scene.get("i") as ImageEl;
    expect(el.crop).toEqual({ x: 0, y: 0, w: 0.75, h: 1 });
    expect(el).toMatchObject({ x: 100, y: 100, w: 150, h: 100 });
    history.undo(scene);
    expect((scene.get("i") as ImageEl).crop).toBeUndefined();
    expect(scene.get("i")).toMatchObject({ x: 100, w: 200, h: 100 });
    expect(history.canUndo()).toBe(false);
    history.redo(scene);
    expect((scene.get("i") as ImageEl).crop).toEqual({ x: 0, y: 0, w: 0.75, h: 1 });
    expect(scene.get("i")).toMatchObject({ w: 150 });
  });

  it("Cancel restores the pre-crop state with no history", () => {
    const { scene, history, crop, preview } = setup();
    crop.begin("i");
    crop.beginDrag("w", 1, 100, 100);
    crop.moveDrag(1, 200, 100);
    crop.cancel();
    expect(scene.get("i")).toEqual(img);
    expect(history.canUndo()).toBe(false);
    expect(crop.active).toBe(false);
    expect(preview).toHaveBeenLastCalledWith(null);
  });

  it("Done with no change pushes nothing", () => {
    const { history, crop } = setup();
    crop.begin("i");
    crop.done();
    expect(history.canUndo()).toBe(false);
  });

  it("Reset then Done removes the crop and restores the full size, undoably", () => {
    const cropped = applyCrop(img, { x: 0.5, y: 0.5, w: 0.25, h: 0.25 });
    const { scene, history, crop } = setup(cropped);
    crop.begin("i");
    crop.reset();
    crop.done();
    const el = scene.get("i") as ImageEl;
    expect(el.crop).toBeUndefined();
    expect(el).toMatchObject({ x: 100, y: 100, w: 200, h: 100 });
    history.undo(scene);
    expect((scene.get("i") as ImageEl).crop).toEqual({ x: 0.5, y: 0.5, w: 0.25, h: 0.25 });
    expect(scene.get("i")).toMatchObject({ w: 50, h: 25 });
    history.redo(scene);
    expect((scene.get("i") as ImageEl).crop).toBeUndefined();
  });

  it("a second pointer cannot start a drag while one is active", () => {
    const { crop } = setup();
    crop.begin("i");
    expect(crop.beginDrag("e", 1, 0, 0)).toBe(true);
    expect(crop.beginDrag("w", 2, 0, 0)).toBe(false);
    crop.moveDrag(2, 50, 0);
    expect(crop.state()?.draft).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("does not begin on a missing or non-image element", () => {
    const { crop } = setup();
    expect(crop.begin("nope")).toBe(false);
  });
});
