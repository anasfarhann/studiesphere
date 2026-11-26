import { describe, expect, it, vi } from "vitest";
import type { CanvasElement, Rect } from "@/canvas/model/types";
import { buildPagePdf, deliverPdf, MAX_PDF_PAGES, pdfFileName, planPages, PdfError, RASTER_MAX_SIDE, sharePagePdf } from "./page-pdf";

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
    for (const call of draw.mock.calls as unknown as unknown[][]) expect(call[4]).toEqual({ background: "#ffffff" });
    expect(preload).toHaveBeenCalledTimes(pages);
    expect(js.calls.addImage.mock.calls[0][1]).toBe("JPEG");
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
    expect(res).toBe("downloaded");
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
