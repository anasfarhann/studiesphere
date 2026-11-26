import { describe, expect, it, vi } from "vitest";
import type { CanvasElement, Rect } from "@/canvas/model/types";
import { buildPagePdf, deliverPdf, MAX_PDF_PAGES, PHOTO_DEADLINE_MS, pdfFileName, planPages, PdfError, RASTER_MAX_SIDE, sharePagePdf } from "./page-pdf";

const A4_W = 595.28;
const A4_H = 841.89;
const r = (w: number, h: number): Rect => ({ minX: 100, minY: 50, maxX: 100 + w, maxY: 50 + h });

describe("planPages", () => {
  it("fits a portrait-ish page on one A4 portrait page, scaled to fit", () => {
    const p = planPages(r(600, 800));
    expect(p.orientation).toBe("portrait");
    expect([p.pageW, p.pageH]).toEqual([A4_W, A4_H]);
    expect(p.slices).toHaveLength(1);
    const s = p.slices[0];
    expect(s.w).toBeLessThanOrEqual(A4_W);
    expect(s.h).toBeLessThanOrEqual(A4_H);
    expect(s.x).toBeGreaterThan(0);
  });

  it("uses landscape when the content is wider than tall", () => {
    const p = planPages(r(1200, 500));
    expect(p.orientation).toBe("landscape");
    expect([p.pageW, p.pageH]).toEqual([A4_H, A4_W]);
    expect(p.slices).toHaveLength(1);
  });

  it("splits a very tall page into several A4 pages at readable (width-fit) scale", () => {
    const p = planPages(r(600, 6000));
    expect(p.orientation).toBe("portrait");
    expect(p.slices.length).toBeGreaterThan(2);
    // Every slice uses the full content width, so text stays as large as on a single page.
    for (const s of p.slices) expect(s.w).toBeCloseTo(p.slices[0].w, 5);
    // Slices tile the page vertically without gaps or overlaps.
    for (let i = 1; i < p.slices.length; i++) expect(p.slices[i].world.minY).toBeCloseTo(p.slices[i - 1].world.maxY, 5);
    expect(p.slices[0].world.minY).toBeCloseTo(50 - 24, 5);
    expect(p.slices.at(-1)!.world.maxY).toBeCloseTo(50 + 6000 + 24, 5);
  });

  it("caps the number of pages", () => {
    const p = planPages(r(300, 5_000_000));
    expect(p.slices.length).toBeLessThanOrEqual(MAX_PDF_PAGES);
  });
});

describe("pdfFileName", () => {
  it("sanitises the title and falls back to Untitled", () => {
    expect(pdfFileName('Cell: wall/membrane? "x"')).toBe("Cell- wall-membrane- -x-.pdf");
    expect(pdfFileName("   ")).toBe("Untitled.pdf");
    expect(pdfFileName("a".repeat(200)).length).toBeLessThanOrEqual(84);
  });
});

function fakeCanvas() {
  const c = { width: 0, height: 0, getContext: () => ({}), toDataURL: vi.fn(() => "data:image/jpeg;base64,AAAA") };
  return c as unknown as HTMLCanvasElement & { toDataURL: ReturnType<typeof vi.fn> };
}
const stroke = (id: string, x: number, y: number): CanvasElement =>
  ({ id, z: 1, updatedAt: 1, type: "stroke", tool: "pen", color: "#000", size: 2, points: [[x, y, 0.5], [x + 100, y + 100, 0.5]], simulatePressure: false }) as CanvasElement;

function fakeJsPdf() {
  const calls = { ctor: [] as unknown[], addPage: vi.fn(), addImage: vi.fn() };
  class Doc {
    constructor(o: unknown) {
      calls.ctor.push(o);
    }
    addPage = calls.addPage;
    addImage = calls.addImage;
    output = vi.fn(() => new Blob(["%PDF"], { type: "application/pdf" }));
  }
  return { calls, load: async () => ({ jsPDF: Doc as never }) };
}

describe("buildPagePdf", () => {
  it("draws the scene through the target on white, once per PDF page, and embeds each as an image", async () => {
    const els = [stroke("a", 0, 0), stroke("b", 0, 3000)];
    const draw = vi.fn(() => true);
    const preload = vi.fn(async () => {});
    const js = fakeJsPdf();
    const blob = await buildPagePdf({ elements: () => els, drawSnapshot: draw, preloadImages: preload }, { loadJsPdf: js.load, createCanvas: fakeCanvas });
    expect(blob.type).toBe("application/pdf");
    expect(js.calls.ctor[0]).toMatchObject({ orientation: "portrait", unit: "pt", format: "a4" });
    const pages = js.calls.addImage.mock.calls.length;
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(js.calls.addPage).toHaveBeenCalledTimes(pages - 1);
    expect(draw).toHaveBeenCalled();
    const opts = (draw.mock.calls as unknown as unknown[][]).map((c) => c[4]);
    expect(opts).toContainEqual({ background: "#ffffff", skipTainted: true });
    for (const o of opts) expect(o).toMatchObject({ skipTainted: true });
    // Once for the whole page up front, then once per PDF page.
    expect(preload).toHaveBeenCalledTimes(pages + 1);
    expect(js.calls.addImage.mock.calls[0][1]).toBe("JPEG");
  });

  it("waits for document.fonts.ready after the probe draw, before the slice draw (no photos)", async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const ready = new Promise<void>((res) => (release = res));
    vi.stubGlobal("document", { fonts: { ready: ready.then(() => void order.push("fonts")) } });
    try {
      const draw = vi.fn(() => (order.push("draw"), true));
      const js = fakeJsPdf();
      const p = buildPagePdf({ elements: () => [stroke("a", 0, 0)], drawSnapshot: draw }, { loadJsPdf: js.load, createCanvas: fakeCanvas });
      await new Promise((r) => setTimeout(r, 20));
      expect(order).toEqual(["draw"]); // only the probe so far: the slice draw waits for the fonts
      release();
      await p;
      expect(order.slice(0, 3)).toEqual(["draw", "fonts", "draw"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("gives up on fonts after 3 s", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("document", { fonts: { ready: new Promise<void>(() => {}) } });
    try {
      const draw = vi.fn(() => true);
      const p = buildPagePdf({ elements: () => [stroke("a", 0, 0)], drawSnapshot: draw }, { loadJsPdf: fakeJsPdf().load, createCanvas: fakeCanvas });
      await vi.advanceTimersByTimeAsync(2_900);
      expect(draw).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(200);
      await p;
      expect(draw.mock.calls.length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("keeps each raster within the size cap", async () => {
    const sizes: number[] = [];
    const js = fakeJsPdf();
    await buildPagePdf(
      { elements: () => [stroke("a", 0, 0)], drawSnapshot: () => true },
      { loadJsPdf: js.load, createCanvas: () => {
          const c = fakeCanvas();
          c.toDataURL.mockImplementation(() => {
            sizes.push(Math.max(c.width, c.height));
            return "data:image/jpeg;base64,AAAA";
          });
          return c;
        },
      },
    );
    expect(sizes.length).toBeGreaterThan(0);
    for (const n of sizes) expect(n).toBeLessThanOrEqual(RASTER_MAX_SIDE);
  });

  it("draws a tainted photo as a box instead of throwing (the canvas stays readable)", async () => {
    const js = fakeJsPdf();
    const tainted = new Set<unknown>();
    const draw = vi.fn((ctx: unknown, _c: unknown, _w: number, _h: number, o?: { skipTainted?: boolean }) => {
      if (!o?.skipTainted) tainted.add(ctx);
      return true;
    });
    const make = () => {
      const c = fakeCanvas();
      const ctx = {};
      c.getContext = (() => ctx) as never;
      c.toDataURL.mockImplementation(() => {
        if (tainted.has(ctx)) throw new DOMException("tainted", "SecurityError");
        return "data:image/jpeg;base64,AAAA";
      });
      return c;
    };
    const blob = await buildPagePdf({ elements: () => [stroke("a", 0, 0)], drawSnapshot: draw as never, hasTaintedImages: () => true }, { loadJsPdf: js.load, createCanvas: make });
    expect(blob.type).toBe("application/pdf");
    expect(js.calls.addImage).toHaveBeenCalled();
  });

  it("stops waiting for photos at the overall deadline", async () => {
    vi.useFakeTimers();
    try {
      const js = fakeJsPdf();
      const never = () => new Promise<void>(() => {});
      const els = [stroke("a", 0, 0), stroke("b", 0, 3000)];
      const p = buildPagePdf({ elements: () => els, drawSnapshot: () => true, preloadImages: never }, { loadJsPdf: js.load, createCanvas: fakeCanvas });
      await vi.advanceTimersByTimeAsync(PHOTO_DEADLINE_MS + 1);
      await expect(p).resolves.toBeInstanceOf(Blob);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects an empty page with a PdfError", async () => {
    await expect(buildPagePdf({ elements: () => [], drawSnapshot: () => true }, { loadJsPdf: fakeJsPdf().load, createCanvas: fakeCanvas })).rejects.toMatchObject({ code: "empty" });
    expect(new PdfError("empty")).toBeInstanceOf(Error);
  });

  it("fails when the renderer is gone", async () => {
    await expect(
      buildPagePdf({ elements: () => [stroke("a", 0, 0)], drawSnapshot: () => false }, { loadJsPdf: fakeJsPdf().load, createCanvas: fakeCanvas }),
    ).rejects.toMatchObject({ code: "render" });
  });
});

describe("deliverPdf", () => {
  const blob = new Blob(["%PDF"], { type: "application/pdf" });

  it("uses navigator.share with the file when files can be shared", async () => {
    const share = vi.fn(async () => {});
    const nav = { canShare: vi.fn(() => true), share } as unknown as Navigator;
    const download = vi.fn();
    expect(await deliverPdf(blob, "Cell walls", { nav, download })).toBe("shared");
    const arg = (share.mock.calls as unknown as [{ files: File[] }][])[0][0];
    expect(arg.files[0].name).toBe("Cell walls.pdf");
    expect(arg.files[0].type).toBe("application/pdf");
    expect(download).not.toHaveBeenCalled();
  });

  it("downloads when sharing files is unsupported", async () => {
    const download = vi.fn();
    const nav = { canShare: () => false, share: vi.fn() } as unknown as Navigator;
    expect(await deliverPdf(blob, "Cell walls", { nav, download })).toBe("downloaded");
    expect(download).toHaveBeenCalledWith(blob, "Cell walls.pdf");
    expect(nav.share).not.toHaveBeenCalled();
    const noShare = {} as Navigator;
    expect(await deliverPdf(blob, "x", { nav: noShare, download })).toBe("downloaded");
  });

  it("asks for a fresh tap when the gesture is gone (userActivation inactive), without calling share", async () => {
    const share = vi.fn(async () => {});
    const nav = { canShare: () => true, share, userActivation: { isActive: false } } as unknown as Navigator;
    const download = vi.fn();
    expect(await deliverPdf(blob, "t", { nav, download })).toBe("needs-tap");
    expect(share).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    // From a tap the same navigator shares.
    expect(await deliverPdf(blob, "t", { nav, download, fromTap: true })).toBe("shared");
  });

  it("asks for a fresh tap when share is refused with NotAllowedError; from a tap it downloads instead", async () => {
    const denied = Object.assign(new Error("x"), { name: "NotAllowedError" });
    const nav = { canShare: () => true, share: vi.fn(async () => { throw denied; }) } as unknown as Navigator;
    const download = vi.fn();
    expect(await deliverPdf(blob, "t", { nav, download })).toBe("needs-tap");
    expect(download).not.toHaveBeenCalled();
    expect(await deliverPdf(blob, "t", { nav, download, fromTap: true })).toBe("downloaded");
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("treats a dismissed share sheet as cancelled, and falls back to download on other share errors", async () => {
    const download = vi.fn();
    const abort = Object.assign(new Error("x"), { name: "AbortError" });
    const nav1 = { canShare: () => true, share: vi.fn(async () => { throw abort; }) } as unknown as Navigator;
    expect(await deliverPdf(blob, "t", { nav: nav1, download })).toBe("cancelled");
    expect(download).not.toHaveBeenCalled();
    const nav2 = { canShare: () => true, share: vi.fn(async () => { throw new Error("nope"); }) } as unknown as Navigator;
    expect(await deliverPdf(blob, "t", { nav: nav2, download })).toBe("downloaded");
  });
});

describe("sharePagePdf", () => {
  it("builds from the target, delivers, and releases the target", async () => {
    const destroy = vi.fn();
    const js = fakeJsPdf();
    const deliver = vi.fn(async () => "downloaded" as const);
    const target = { elements: () => [stroke("a", 0, 0)], drawSnapshot: () => true, destroy };
    const res = await sharePagePdf({ title: "T", target: async () => target, build: { loadJsPdf: js.load, createCanvas: fakeCanvas }, deliver });
    expect(res.result).toBe("downloaded");
    expect(res.blob).toBeInstanceOf(Blob);
    expect(deliver).toHaveBeenCalledWith(expect.any(Blob), "T");
    expect(destroy).toHaveBeenCalled();
  });

  it("releases the target when building fails", async () => {
    const destroy = vi.fn();
    const target = { elements: () => [], drawSnapshot: () => true, destroy };
    await expect(sharePagePdf({ title: "T", target: async () => target, build: { loadJsPdf: fakeJsPdf().load, createCanvas: fakeCanvas } })).rejects.toBeInstanceOf(PdfError);
    expect(destroy).toHaveBeenCalled();
  });
});
