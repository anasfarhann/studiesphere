import { describe, expect, it, vi } from "vitest";
import { compressImage, fitWithin, type ImageIO } from "./compress-image";

function fakeIo(width: number, height: number, alpha = false) {
  const render = vi.fn((_d: unknown, w: number, h: number) => ({
    width: w,
    height: h,
    hasAlpha: () => alpha,
    toBlob: vi.fn(async (type: string, q: number) => Object.assign(new Blob(["x"], { type }), { q })),
  }));
  const io: ImageIO = { decode: async () => ({ width, height, release: () => {} }), render };
  return { io, render };
}

const file = (type: string) => new File(["x"], "p", { type });

describe("compressImage", () => {
  it("scales a 4000x3000 image to 2048x1536", async () => {
    const { io, render } = fakeIo(4000, 3000);
    await compressImage(file("image/jpeg"), 2048, 0.8, io);
    expect(render.mock.calls[0].slice(1)).toEqual([2048, 1536]);
  });

  it("never upscales", () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it("encodes JPEG at the given quality", async () => {
    const { io } = fakeIo(100, 100);
    const blob = await compressImage(file("image/heic"), 2048, 0.8, io);
    expect(blob.type).toBe("image/jpeg");
    expect((blob as Blob & { q: number }).q).toBe(0.8);
  });

  it("keeps a PNG with transparency as PNG, flattens an opaque PNG to JPEG", async () => {
    expect((await compressImage(file("image/png"), 2048, 0.8, fakeIo(10, 10, true).io)).type).toBe("image/png");
    expect((await compressImage(file("image/png"), 2048, 0.8, fakeIo(10, 10, false).io)).type).toBe("image/jpeg");
    expect((await compressImage(file("image/jpeg"), 2048, 0.8, fakeIo(10, 10, true).io)).type).toBe("image/jpeg");
  });
});
