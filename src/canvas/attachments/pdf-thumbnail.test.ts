import { afterEach, describe, expect, it, vi } from "vitest";

const getDocument = vi.fn();
vi.mock("pdfjs-dist", () => ({ getDocument: (...a: unknown[]) => getDocument(...a), GlobalWorkerOptions: {} }));

import { renderPdfThumbnail } from "./pdf-thumbnail";

function stubCanvas(blob: Blob | null) {
  const ctx = { fillRect: () => {}, fillStyle: "" };
  const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (b: Blob | null) => void) => cb(blob) };
  vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLElement);
  return canvas;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  getDocument.mockReset();
});

describe("renderPdfThumbnail", () => {
  it("renders page 1 scaled to maxWidth and returns the blob", async () => {
    const out = new Blob(["jpg"], { type: "image/jpeg" });
    const canvas = stubCanvas(out);
    const render = vi.fn(() => ({ promise: Promise.resolve() }));
    const destroy = vi.fn();
    const getViewport = vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }));
    getDocument.mockReturnValue({ promise: Promise.resolve({ getPage: async () => ({ getViewport, render }) }), destroy });
    const res = await renderPdfThumbnail(new Blob(["%PDF"]), 300);
    expect(res).toBe(out);
    expect(getViewport).toHaveBeenCalledWith({ scale: 0.5 });
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(400);
    expect(render).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalled();
  });

  it("returns null when pdfjs throws", async () => {
    getDocument.mockReturnValue({ promise: Promise.reject(new Error("bad pdf")) });
    expect(await renderPdfThumbnail(new Blob(["x"]))).toBeNull();
  });

  it("returns null after 8 seconds", async () => {
    vi.useFakeTimers();
    getDocument.mockReturnValue({ promise: new Promise(() => {}), destroy: vi.fn() });
    const p = renderPdfThumbnail(new Blob(["x"]));
    await vi.advanceTimersByTimeAsync(8000);
    expect(await p).toBeNull();
  });
});
