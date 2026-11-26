import { describe, expect, it, vi } from "vitest";
import type { CanvasElement, StrokeEl } from "../model/types";
import type { Camera } from "../view/camera";
import {
  capturePreview,
  encodeJpeg,
  frameRect,
  PREVIEW_MARGIN,
  PREVIEW_MAX_H,
  PREVIEW_MAX_W,
  PREVIEW_QUALITY,
  previewFrame,
  type PreviewTarget,
} from "./page-preview";

const rect = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });

describe("previewFrame", () => {
  it("is null for an empty page", () => {
    expect(previewFrame([])).toBeNull();
  });

  it("frames the bounding box of all elements with a small margin, 480 px wide", () => {
    const f = previewFrame([rect(100, 200, 500, 400), rect(300, 250, 900, 900)])!;
    // Union 100..900 x 200..900 (800 x 700), plus the margin on every side.
    const m = Math.max(PREVIEW_MARGIN, 800 * 0.04); // 4% of the width
    expect(f.x).toBeCloseTo(100 - m);
    expect(f.y).toBeCloseTo(200 - m);
    expect(f.width).toBe(PREVIEW_MAX_W);
    expect(f.scale).toBeCloseTo(PREVIEW_MAX_W / (800 + 2 * m));
    expect(f.height).toBe(Math.round((700 + 2 * m) * f.scale));
  });

  it("never exceeds 480 px wide however wide the page is", () => {
    const f = previewFrame([rect(0, 0, 20_000, 9_000)])!;
    expect(f.width).toBe(PREVIEW_MAX_W);
    expect(f.scale).toBeLessThan(0.03);
  });

  it("caps the height, keeping the top band of a tall page, with a width-based margin", () => {
    const f = previewFrame([rect(0, 0, 600, 10_000)])!;
    expect(f.width).toBe(PREVIEW_MAX_W);
    expect(f.height).toBe(PREVIEW_MAX_H);
    // The margin follows the width (600), not the 10 000 tall extent: content is not shrunk by huge side margins.
    expect(f.x).toBeCloseTo(-PREVIEW_MARGIN);
    expect(f.y).toBeCloseTo(-PREVIEW_MARGIN);
    expect(f.scale).toBeCloseTo(PREVIEW_MAX_W / (600 + 2 * PREVIEW_MARGIN));
  });

  it("frameRect is the world rectangle the preview shows", () => {
    const f = previewFrame([rect(0, 0, 600, 10_000)])!;
    const r = frameRect(f);
    expect(r.minX).toBeCloseTo(f.x);
    expect(r.minY).toBeCloseTo(f.y);
    expect(r.maxX).toBeCloseTo(f.x + f.width / f.scale);
    expect(r.maxY).toBeCloseTo(f.y + f.height / f.scale);
    expect(r.maxY).toBeLessThan(1_000);
  });

  it("does not blow a small scribble up more than 2x, and keeps at least a 4:3 shape", () => {
    const f = previewFrame([rect(10, 10, 30, 20)])!;
    expect(f.scale).toBeLessThanOrEqual(2);
    expect(f.width).toBe(PREVIEW_MAX_W);
    expect(f.height).toBe(Math.round(PREVIEW_MAX_W * 0.75));
  });
});

const stroke = (x: number): StrokeEl => ({
  id: `s${x}`, z: 1, updatedAt: 1, type: "stroke", tool: "pen", color: "#111", size: 4,
  points: [[x, 0, 0.5], [x + 100, 100, 0.5]], simulatePressure: false,
});

function fakeCanvas() {
  const ctx = { tag: "ctx" } as unknown as CanvasRenderingContext2D;
  const toBlob = vi.fn<(cb: (b: Blob | null) => void, type?: string, q?: number) => void>((cb) => cb(new Blob(["jpg"], { type: "image/jpeg" })));
  const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob } as unknown as HTMLCanvasElement;
  return { canvas, ctx, toBlob };
}

describe("capturePreview", () => {
  it("returns null without drawing when the page is empty", () => {
    const draw = vi.fn(() => true);
    const target: PreviewTarget = { elements: () => [], drawSnapshot: draw };
    expect(capturePreview(target, () => fakeCanvas().canvas)).toBeNull();
    expect(draw).not.toHaveBeenCalled();
  });

  it("returns null without drawing when a photo in the frame would taint the canvas", () => {
    const draw = vi.fn(() => true);
    const seen: unknown[] = [];
    const target: PreviewTarget = {
      elements: () => [stroke(0)],
      drawSnapshot: draw,
      hasTaintedImages: (area) => (seen.push(area), true),
    };
    expect(capturePreview(target, () => fakeCanvas().canvas)).toBeNull();
    expect(draw).not.toHaveBeenCalled();
    expect(seen).toHaveLength(1);
  });

  it("draws the scene through the target with a camera on the frame", () => {
    const els: CanvasElement[] = [stroke(0), stroke(400)];
    const f = fakeCanvas();
    let seen: { camera: Camera; w: number; h: number } | null = null;
    const target: PreviewTarget = {
      elements: () => els,
      drawSnapshot: (ctx, camera, w, h) => {
        expect(ctx).toBe(f.ctx);
        seen = { camera, w, h };
        return true;
      },
    };
    const out = capturePreview(target, () => f.canvas);
    expect(out).toBe(f.canvas);
    expect(f.canvas.width).toBe(PREVIEW_MAX_W);
    expect(seen!.w).toBe(PREVIEW_MAX_W);
    expect(seen!.h).toBe(f.canvas.height);
    expect(seen!.camera.zoom).toBeLessThanOrEqual(2);
    expect(seen!.camera.x).toBeLessThan(0);
  });

  it("returns null when the renderer is gone", () => {
    const target: PreviewTarget = { elements: () => [stroke(0)], drawSnapshot: () => false };
    expect(capturePreview(target, () => fakeCanvas().canvas)).toBeNull();
  });
});

describe("encodeJpeg", () => {
  it("encodes as JPEG at quality 0.7", async () => {
    const f = fakeCanvas();
    const blob = await encodeJpeg(f.canvas);
    expect(blob?.type).toBe("image/jpeg");
    expect(f.toBlob.mock.calls[0][1]).toBe("image/jpeg");
    expect(f.toBlob.mock.calls[0][2]).toBe(PREVIEW_QUALITY);
    expect(PREVIEW_QUALITY).toBe(0.7);
  });

  it("releases the canvas backing store once encoded (iOS canvas memory)", async () => {
    const f = fakeCanvas();
    f.canvas.width = 480;
    f.canvas.height = 360;
    await encodeJpeg(f.canvas);
    expect(f.canvas.width).toBe(0);
    expect(f.canvas.height).toBe(0);
  });

  it("resolves null when the browser cannot encode", async () => {
    const canvas = { toBlob: () => { throw new Error("tainted"); } } as unknown as HTMLCanvasElement;
    expect(await encodeJpeg(canvas)).toBeNull();
  });
});
