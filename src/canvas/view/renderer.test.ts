import { beforeEach, describe, expect, it, vi } from "vitest";
import { Scene } from "../model/scene";
import type { CanvasElement, StrokeEl } from "../model/types";
import { Camera } from "./camera";
import { Renderer } from "./renderer";

const stroke = (id: string, x: number, updatedAt = 1, z = 1): StrokeEl => ({
  id, z, updatedAt, type: "stroke", tool: "pen", color: "#111", size: 4,
  points: [[x, 0, 0.5], [x + 20, 20, 0.5]], simulatePressure: false,
});

function fakeCtx() {
  const calls: string[] = [];
  const rec = (name: string) => (...a: unknown[]) => { calls.push(name); void a; };
  const ctx = {
    calls, fillStyle: "", strokeStyle: "", globalAlpha: 1, lineWidth: 1, font: "", textBaseline: "",
    setTransform: vi.fn(rec("setTransform")), fillRect: vi.fn(rec("fillRect")), fill: vi.fn(rec("fill")),
    fillText: vi.fn(rec("fillText")), strokeRect: vi.fn(rec("strokeRect")), setLineDash: vi.fn(rec("setLineDash")),
    beginPath: vi.fn(rec("beginPath")), roundRect: vi.fn(rec("roundRect")), stroke: vi.fn(rec("stroke")),
    save: vi.fn(rec("save")), restore: vi.fn(rec("restore")), drawImage: vi.fn(rec("drawImage")),
    moveTo: vi.fn(rec("moveTo")), lineTo: vi.fn(rec("lineTo")), arc: vi.fn(rec("arc")),
  };
  return ctx;
}

class FakePath {
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  closePath() {}
}

describe("Renderer", () => {
  let canvas: HTMLCanvasElement;
  let ctx: ReturnType<typeof fakeCtx>;
  let scene: Scene;
  let camera: Camera;
  let frames: Array<() => void>;
  let made: number;
  const raf = (cb: () => void) => { frames.push(cb); return frames.length; };
  const caf = vi.fn();
  const flush = () => { const f = frames; frames = []; f.forEach((cb) => cb()); };
  const make = () =>
    new Renderer(canvas, scene, camera, {
      raf, caf, createPath: () => { made++; return new FakePath() as unknown as Path2D; },
    });

  beforeEach(() => {
    canvas = document.createElement("canvas");
    ctx = fakeCtx();
    canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
    scene = new Scene();
    camera = new Camera();
    frames = [];
    made = 0;
    caf.mockClear();
  });

  it("resize sets backing size and css size and requests a frame", () => {
    const r = make();
    r.resize(100, 50, 2);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);
    expect(canvas.style.width).toBe("100px");
    expect(frames).toHaveLength(1);
  });

  describe("dot-grid background", () => {
    const dots = () => ctx.arc.mock.calls.map((c) => [c[0] as number, c[1] as number]);

    it("fills the ground colour then draws dots only inside the view, 28 world px apart", () => {
      const r = make();
      r.resize(100, 100, 1);
      camera.x = 50;
      camera.y = 50;
      flush();
      expect(ctx.fillRect.mock.calls[0]).toEqual([0, 0, 100, 100]);
      const pts = dots();
      expect(pts.length).toBeGreaterThan(0);
      // view is world 50..150; allow the dot radius at the edges
      for (const [x, y] of pts) {
        expect(x % 28).toBe(0);
        expect(y % 28).toBe(0);
        expect(x).toBeGreaterThanOrEqual(50 - 2);
        expect(x).toBeLessThanOrEqual(150 + 2);
        expect(y).toBeGreaterThanOrEqual(50 - 2);
        expect(y).toBeLessThanOrEqual(150 + 2);
      }
      // 56, 84, 112, 140 in each axis
      expect(pts).toHaveLength(16);
    });

    it("is one path: no per-dot save/restore", () => {
      const r = make();
      r.resize(300, 300, 1);
      flush();
      expect(ctx.arc.mock.calls.length).toBeGreaterThan(50);
      expect(ctx.save).not.toHaveBeenCalled();
      expect(ctx.calls.filter((c) => c === "beginPath")).toHaveLength(1);
    });

    it("draws no dots below zoom 0.35", () => {
      const r = make();
      r.resize(300, 300, 1);
      camera.zoom = 0.3;
      flush();
      expect(ctx.arc).not.toHaveBeenCalled();
    });

    it("stays bounded and sparse-enough on a large view at the lowest zoom", () => {
      const r = make();
      r.resize(2732, 2048, 1);
      camera.zoom = 0.35;
      flush();
      const pts = dots();
      expect(pts.length).toBeGreaterThan(0);
      expect(pts.length).toBeLessThanOrEqual(140 * 140);
      const xs = [...new Set(pts.map((p) => p[0]))].sort((a, b) => a - b);
      const ys = [...new Set(pts.map((p) => p[1]))].sort((a, b) => a - b);
      expect(xs.length).toBeLessThanOrEqual(140);
      expect(ys.length).toBeLessThanOrEqual(140);
      expect((xs[1] - xs[0]) * 0.35).toBeGreaterThanOrEqual(14);
      expect((ys[1] - ys[0]) * 0.35).toBeGreaterThanOrEqual(14);
    });

    it("spaces dots 28 world px apart at zoom 1", () => {
      const r = make();
      r.resize(300, 300, 1);
      flush();
      const xs = [...new Set(dots().map((p) => p[0]))].sort((a, b) => a - b);
      expect(xs[1] - xs[0]).toBe(28);
    });

    it("draws dots at zoom 0.35", () => {
      const r = make();
      r.resize(300, 300, 1);
      camera.zoom = 0.35;
      flush();
      expect(ctx.arc).toHaveBeenCalled();
    });
  });

  it("coalesces requestFrame calls", () => {
    const r = make();
    r.resize(100, 100, 1);
    flush();
    r.requestFrame(); r.requestFrame(); r.requestFrame();
    expect(frames).toHaveLength(1);
  });

  it("draws only visible elements, with the dpr*zoom transform", () => {
    scene.add(stroke("a", 10));
    scene.add(stroke("far", 5000));
    const r = make();
    r.resize(200, 200, 2);
    camera.zoom = 2; camera.x = 5; camera.y = 3;
    flush();
    expect(ctx.fill).toHaveBeenCalledTimes(2); // dot grid + the visible stroke
    expect(ctx.setTransform).toHaveBeenCalledWith(4, 0, 0, 4, -20, -12);
  });

  it("caches paths by id/updatedAt and rebuilds on change", () => {
    scene.add(stroke("a", 10));
    const r = make();
    r.resize(200, 200, 1);
    flush();
    expect(made).toBe(1);
    r.requestFrame(); flush();
    expect(made).toBe(1);
    scene.update("a", { points: [[10, 0, 0.5], [40, 40, 0.5]] });
    flush();
    expect(made).toBe(2);
  });

  it("drops cached paths of removed elements even when scene size is unchanged", () => {
    scene.add(stroke("a", 10));
    const r = make();
    r.resize(200, 200, 1);
    flush();
    expect(r.cachedPathCount).toBe(1);
    scene.remove("a");
    scene.add(stroke("b", 5000));
    flush();
    expect(r.cachedPathCount).toBe(0);
  });

  it("highlighter uses alpha 0.35 and restores it", () => {
    const alphas: number[] = [];
    ctx.fill.mockImplementation(() => { alphas.push(ctx.globalAlpha); });
    scene.add({ ...stroke("h", 10), tool: "highlighter" });
    const r = make();
    r.resize(200, 200, 1);
    flush();
    expect(alphas).toEqual([1, 0.35]); // dot grid, then the highlighter
    expect(ctx.globalAlpha).toBe(1);
  });

  it("draws live stroke on top without caching, and selection boxes", () => {
    scene.add(stroke("a", 10));
    const r = make();
    r.resize(200, 200, 1);
    r.setLive(stroke("live", 30));
    r.setSelection(["a"]);
    flush();
    expect(ctx.fill).toHaveBeenCalledTimes(3); // dot grid + stroke + live stroke
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    r.requestFrame(); flush();
    expect(ctx.fill).toHaveBeenCalledTimes(6);
  });

  it("draws the snap ghost at 40% alpha in the stroke colour with a dashed hint, building its path once", () => {
    const r = make();
    r.resize(200, 200, 1);
    flush();
    const ghost: StrokeEl = { ...stroke("g", 0), color: "#dc2626", points: [[0, 0, 0.5], [4, 0, 0.5], [8, 0, 0.5]] };
    const seen: Array<{ alpha: number; fill: unknown }> = [];
    ctx.fill.mockImplementation(() => { seen.push({ alpha: ctx.globalAlpha, fill: ctx.fillStyle }); });
    const madeBefore = made;
    r.setGhost(ghost);
    flush();
    expect(seen).toContainEqual({ alpha: 0.4, fill: "#dc2626" });
    expect(ctx.setLineDash.mock.calls.some(([d]) => (d as number[]).length > 0)).toBe(true);
    expect(ctx.strokeStyle).toBe("#dc2626");
    expect(ctx.globalAlpha).toBe(1);
    r.requestFrame(); flush();
    expect(made - madeBefore).toBe(1);
    const fills = ctx.fill.mock.calls.length;
    r.setGhost(null);
    flush();
    expect(ctx.fill.mock.calls.length - fills).toBe(1); // only the dot grid
  });

  it("draws text lines and a file card (badge, name, size)", () => {
    const els: CanvasElement[] = [
      { id: "t", z: 1, updatedAt: 1, type: "text", x: 0, y: 0, w: 100, text: "a\nb", fontSize: 16, color: "#000" },
      { id: "f", z: 2, updatedAt: 1, type: "file", x: 0, y: 100, assetPath: "p", fileName: "f", mime: "x", bytes: 1 },
    ];
    els.forEach((e) => scene.add(e));
    const r = make();
    r.resize(400, 400, 1);
    flush();
    const drawn = (ctx.fillText as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0]);
    expect(drawn).toEqual(expect.arrayContaining(["a", "b", "FILE", "f", "1 B"]));
    expect(ctx.roundRect).toHaveBeenCalledTimes(2); // card shell + badge
  });

  describe("text styles", () => {
    const base = { id: "t", z: 1, updatedAt: 1, type: "text", x: 0, y: 0, w: 400, text: "ab\ncd", fontSize: 16, color: "#000" } as const;
    const drawWith = (el: CanvasElement) => {
      scene.add(el);
      const used: string[] = [];
      let current = "";
      Object.defineProperty(ctx, "font", { get: () => current, set: (v: string) => { current = v; used.push(v); }, configurable: true });
      const r = make();
      r.resize(400, 400, 1);
      flush();
      return used;
    };

    it("a legacy text element is drawn in exactly the old font, with no underline", () => {
      const used = drawWith(base);
      expect(used).toContain("16px sans-serif");
      expect(ctx.fillRect.mock.calls.length).toBe(1); // only the background fill, no underline
    });

    it("builds the font from font, bold and italic", () => {
      const used = drawWith({ ...base, font: "serif", bold: true, italic: true });
      expect(used).toContain("italic bold 16px Lora, serif");
    });

    it("underline draws one line under each non-empty wrapped line", () => {
      drawWith({ ...base, underline: true });
      expect(ctx.fillRect.mock.calls.length).toBe(1 + 2);
    });
  });

  describe("text width", () => {
    const text = "aaaa bbbb cccc dddd";
    const base = { id: "t", z: 1, updatedAt: 1, type: "text", x: 5, y: 7, w: 100, text, fontSize: 16, color: "#000" } as const;
    const drawn = () => (ctx.fillText as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const withMeasure = () => Object.assign(ctx, { measureText: (s: string) => ({ width: s.length * 8 }) });

    it("a legacy box (no autoW) wraps at its stored w, at exactly the old positions", () => {
      withMeasure();
      scene.add(base);
      const r = make();
      r.resize(400, 400, 1);
      flush();
      expect(drawn()).toEqual([
        ["aaaa bbbb", 5, 7 + 16 * 1.4],
        ["cccc dddd", 5, 7 + 16 * 1.4 * 2],
      ]);
    });

    it("an auto box is as wide as its text: no wrap below the maximum, whatever the stored w", () => {
      withMeasure();
      scene.add({ ...base, autoW: true });
      const r = make();
      r.resize(400, 400, 1);
      flush();
      expect(drawn()).toEqual([[text, 5, 7 + 16 * 1.4]]);
    });

    it("caches a box's wrapped lines until it changes", () => {
      let calls = 0;
      Object.assign(ctx, { measureText: (str: string) => { calls++; return { width: str.length * 8 }; } });
      scene.add({ ...base, autoW: true });
      const r = make();
      r.resize(400, 400, 1);
      flush();
      const first = calls;
      expect(first).toBeGreaterThan(0);
      r.requestFrame(); flush();
      expect(calls).toBe(first);
      scene.update("t", { text: "changed" });
      flush();
      expect(calls).toBeGreaterThan(first);
    });

    it("measures with the box's own font", () => {
      withMeasure();
      const r = make();
      const fonts: string[] = [];
      let cur = "";
      Object.defineProperty(ctx, "font", { get: () => cur, set: (v: string) => { cur = v; fonts.push(v); }, configurable: true });
      expect(r.measureFor({ font: "serif", bold: true })("abc", 20)).toBe(24);
      expect(fonts).toContain("bold 20px Lora, serif");
    });

    it("a single selected text box shows a handle on its right edge", () => {
      scene.add({ ...base, autoW: false });
      const r = make();
      r.resize(400, 400, 1);
      r.setSelection(["t"]);
      flush();
      const rects = ctx.fillRect.mock.calls.slice(1); // after the background
      expect(rects).toHaveLength(1);
      const [x, , w] = rects[0] as number[];
      expect(x + w / 2).toBeCloseTo(105);
    });
  });

  describe("images", () => {
    const photo = { id: "p", z: 1, updatedAt: 1, type: "image", x: 10, y: 20, w: 200, h: 100, assetPath: "o/p/a.jpg" } as const;
    const settle = () => new Promise((r) => setTimeout(r, 0));
    const bitmap = { width: 400, height: 200 } as unknown as ImageBitmap;
    const makeWith = (loadImage: (p: string) => Promise<ImageBitmap | HTMLImageElement>) =>
      new Renderer(canvas, scene, camera, { raf, caf, loadImage });

    it("draws a grey placeholder until the image loads, then the image, requesting a frame", async () => {
      scene.add(photo);
      const load = vi.fn(async () => bitmap);
      const r = makeWith(load);
      r.resize(400, 400, 1);
      flush();
      expect(ctx.drawImage).not.toHaveBeenCalled();
      expect(ctx.roundRect).toHaveBeenCalledTimes(1);
      await settle();
      expect(frames).toHaveLength(1);
      flush();
      expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 10, 20, 200, 100);
      r.requestFrame(); flush();
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("a cropped photo draws only its source sub-rect into its rectangle (9-argument form)", async () => {
      scene.add({ ...photo, w: 100, h: 100, crop: { x: 0.5, y: 0, w: 0.25, h: 0.5 } });
      const r = makeWith(async () => bitmap);
      r.resize(400, 400, 1);
      flush(); await settle(); flush();
      expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 200, 0, 100, 100, 10, 20, 100, 100);
    });

    it("a photo with a malformed crop is drawn whole, as without one", async () => {
      scene.add({ ...photo, crop: { x: 2, y: 0, w: 9, h: 0 } });
      const r = makeWith(async () => bitmap);
      r.resize(400, 400, 1);
      flush(); await settle(); flush();
      expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 10, 20, 200, 100);
    });

    it("an image preview draws the whole source at the preview rectangle", async () => {
      scene.add({ ...photo, w: 100, h: 100, crop: { x: 0.5, y: 0, w: 0.25, h: 0.5 } });
      const r = makeWith(async () => bitmap);
      r.resize(400, 400, 1);
      flush(); await settle(); flush();
      ctx.drawImage.mockClear();
      r.setImagePreview({ id: "p", x: -90, y: 20, w: 400, h: 200 });
      flush();
      expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, -90, 20, 400, 200);
    });

    it("a failed load keeps the placeholder with a broken-image mark and never retries per frame", async () => {
      scene.add(photo);
      const load = vi.fn(async () => { throw new Error("404"); });
      const r = makeWith(load);
      r.resize(400, 400, 1);
      flush();
      await settle();
      flush();
      expect(ctx.drawImage).not.toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      r.requestFrame(); flush();
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("never loads images that are off screen", async () => {
      scene.add({ ...photo, id: "far", x: 5000, assetPath: "far.jpg" });
      const load = vi.fn(async () => bitmap);
      const r = makeWith(load);
      r.resize(400, 400, 1);
      flush();
      await settle();
      expect(load).not.toHaveBeenCalled();
    });

    it("evicts the least recently drawn image over budget, closes it, and reloads it on return", async () => {
      const mk = () => ({ width: 400, height: 200, close: vi.fn() }) as unknown as ImageBitmap;
      const bitmaps: Record<string, ImageBitmap> = { "a.jpg": mk(), "b.jpg": mk() };
      const load = vi.fn(async (p: string) => bitmaps[p]);
      scene.add({ ...photo, id: "a", x: 10, assetPath: "a.jpg" });
      scene.add({ ...photo, id: "b", x: 3000, assetPath: "b.jpg" });
      // 400*200*4 = 320 000 bytes each; budget fits one.
      const r = new Renderer(canvas, scene, camera, { raf, caf, loadImage: load, imageBudgetBytes: 500_000 });
      r.resize(400, 400, 1);
      flush(); await settle(); flush();
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      camera.x = 3000;
      r.requestFrame(); flush(); await settle(); flush();
      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
      expect((bitmaps["a.jpg"] as unknown as { close: () => void }).close).toHaveBeenCalledTimes(1);
      expect((bitmaps["b.jpg"] as unknown as { close: () => void }).close).not.toHaveBeenCalled();
      camera.x = 0;
      r.requestFrame(); flush(); await settle(); flush();
      expect(load.mock.calls.filter((c) => c[0] === "a.jpg")).toHaveLength(2);
      expect(ctx.drawImage).toHaveBeenCalledTimes(3);
    });

    it("keeps every visible image even when over budget", async () => {
      const mk = () => ({ width: 400, height: 200, close: vi.fn() }) as unknown as ImageBitmap;
      scene.add({ ...photo, id: "a", x: 10, assetPath: "a.jpg" });
      scene.add({ ...photo, id: "b", x: 10, y: 200, assetPath: "b.jpg" });
      const r = new Renderer(canvas, scene, camera, { raf, caf, loadImage: async () => mk(), imageBudgetBytes: 1 });
      r.resize(400, 400, 1);
      flush(); await settle(); flush();
      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    });

    describe("retry", () => {
      it("retries a failed load after a cooldown (backing off), forgetting the signed url", async () => {
        vi.useFakeTimers();
        try {
          scene.add(photo);
          const load = vi.fn<(p: string) => Promise<ImageBitmap>>().mockRejectedValue(new Error("5xx"));
          const forget = vi.fn();
          const r = new Renderer(canvas, scene, camera, { raf, caf, loadImage: load, forgetImage: forget });
          r.resize(400, 400, 1);
          flush(); await vi.advanceTimersByTimeAsync(0); flush();
          expect(load).toHaveBeenCalledTimes(1);
          await vi.advanceTimersByTimeAsync(4_900); flush();
          expect(load).toHaveBeenCalledTimes(1);
          await vi.advanceTimersByTimeAsync(200); flush();
          expect(forget).toHaveBeenCalledWith("o/p/a.jpg");
          expect(load).toHaveBeenCalledTimes(2);
          // second failure: next retry only after 10 s
          await vi.advanceTimersByTimeAsync(0); flush();
          await vi.advanceTimersByTimeAsync(9_000); flush();
          expect(load).toHaveBeenCalledTimes(2);
          load.mockResolvedValue(bitmap);
          await vi.advanceTimersByTimeAsync(1_500); flush();
          await vi.advanceTimersByTimeAsync(0); flush();
          expect(ctx.drawImage).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
        }
      });

      it("a load that fails after destroy schedules nothing and never loads again", async () => {
        vi.useFakeTimers();
        try {
          scene.add(photo);
          let reject!: (e: Error) => void;
          const load = vi.fn(() => new Promise<ImageBitmap>((_, rej) => { reject = rej; }));
          const r = makeWith(load);
          r.resize(400, 400, 1);
          flush();
          r.destroy();
          reject(new Error("offline"));
          await vi.advanceTimersByTimeAsync(0);
          expect(vi.getTimerCount()).toBe(0);
          await vi.advanceTimersByTimeAsync(120_000);
          flush();
          expect(load).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
        }
      });

      it("re-arms the retry when its timer fires early", async () => {
        vi.useFakeTimers();
        try {
          scene.add(photo);
          const load = vi.fn<(p: string) => Promise<ImageBitmap>>().mockRejectedValueOnce(new Error("x")).mockResolvedValue(bitmap);
          const r = makeWith(load);
          r.resize(400, 400, 1);
          flush(); await vi.advanceTimersByTimeAsync(0); flush();
          // Clock steps back 3 s, so the 5 s timer fires before retryAt.
          vi.setSystemTime(Date.now() - 3_000);
          await vi.advanceTimersByTimeAsync(5_000); flush();
          expect(load).toHaveBeenCalledTimes(1);
          await vi.advanceTimersByTimeAsync(3_100); flush();
          await vi.advanceTimersByTimeAsync(0); flush();
          expect(load).toHaveBeenCalledTimes(2);
          expect(ctx.drawImage).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
        }
      });

      it("retries immediately when the browser comes back online", async () => {
        scene.add(photo);
        const load = vi.fn<(p: string) => Promise<ImageBitmap>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(bitmap);
        const r = makeWith(load);
        r.resize(400, 400, 1);
        flush(); await settle(); flush();
        window.dispatchEvent(new Event("online"));
        flush(); await settle(); flush();
        expect(load).toHaveBeenCalledTimes(2);
        expect(ctx.drawImage).toHaveBeenCalledTimes(1);
        r.destroy();
      });
    });

    it("draws a resize handle only for a single selected image", async () => {
      scene.add(photo);
      const r = makeWith(async () => bitmap);
      r.resize(400, 400, 1);
      r.setSelection(["p"]);
      flush();
      // background + handle square; one dashed box
      expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
      expect(ctx.fillRect).toHaveBeenCalledTimes(2);
    });

    it("without a loader it just draws the placeholder", () => {
      scene.add(photo);
      const r = make();
      r.resize(400, 400, 1);
      flush();
      expect(ctx.roundRect).toHaveBeenCalledTimes(1);
    });
  });

  it("destroy unsubscribes and cancels pending frame", () => {
    const r = make();
    r.resize(100, 100, 1);
    r.destroy();
    expect(caf).toHaveBeenCalled();
    frames = [];
    scene.add(stroke("z", 1));
    expect(frames).toHaveLength(0);
  });

  it("draws an audio card shell with its duration", () => {
    scene.add({ id: "a", z: 1, updatedAt: 1, type: "audio", x: 0, y: 0, assetPath: "p", durationMs: 125_000 });
    const r = make();
    r.resize(400, 300, 1);
    flush();
    expect(ctx.roundRect).toHaveBeenCalledTimes(2);
    expect(ctx.fillText).toHaveBeenCalledWith("2:05", expect.any(Number), expect.any(Number));
    r.destroy();
  });
  describe("drawSnapshot (page previews)", () => {
    const photo = { id: "p", z: 2, updatedAt: 1, type: "image", x: 10, y: 20, w: 200, h: 100, assetPath: "o/p/a.jpg" } as const;
    const bitmap = { width: 400, height: 200 } as unknown as ImageBitmap;

    it("draws the scene onto another context through another camera, without selection or live ink", () => {
      scene.add(stroke("a", 0));
      const r = make();
      r.resize(100, 100, 2);
      flush();
      r.setSelection(["a"]);
      r.setLive(stroke("live", 500));
      flush();
      const other = fakeCtx();
      const made0 = made;
      const ok = r.drawSnapshot(other as unknown as CanvasRenderingContext2D, new Camera(-10, -10, 0.5), 240, 180);
      expect(ok).toBe(true);
      // Ground over the whole target, then the world transform of the snapshot camera at dpr 1.
      expect(other.fillRect.mock.calls[0]).toEqual([0, 0, 240, 180]);
      expect(other.setTransform.mock.calls[1]).toEqual([0.5, 0, 0, 0.5, 5, 5]);
      expect(other.fill).toHaveBeenCalled();
      expect(other.strokeRect).not.toHaveBeenCalled(); // no selection box
      // The cached stroke path is reused: no new path for "a"; the live stroke is not drawn.
      expect(made).toBe(made0);
      expect(frames).toHaveLength(0);
      // The live canvas still draws with its own context and camera afterwards.
      ctx.setTransform.mockClear();
      r.requestFrame();
      flush();
      expect(ctx.setTransform.mock.calls[1]).toEqual([2, 0, 0, 2, -0, -0]);
      r.destroy();
    });

    it("draws nothing and returns false once destroyed", () => {
      scene.add(stroke("a", 0));
      const r = make();
      r.destroy();
      const other = fakeCtx();
      expect(r.drawSnapshot(other as unknown as CanvasRenderingContext2D, new Camera(), 10, 10)).toBe(false);
      expect(other.fillRect).not.toHaveBeenCalled();
    });

    it("preloadImages waits for the page's photos, so the snapshot draws them", async () => {
      scene.add(photo);
      let resolve!: (b: ImageBitmap) => void;
      const load = vi.fn(() => new Promise<ImageBitmap>((res) => { resolve = res; }));
      const r = new Renderer(canvas, scene, camera, { raf, caf, loadImage: load });
      const done = r.preloadImages(1_000);
      expect(load).toHaveBeenCalledWith("o/p/a.jpg");
      resolve(bitmap);
      await done;
      const other = fakeCtx();
      r.drawSnapshot(other as unknown as CanvasRenderingContext2D, new Camera(), 300, 300);
      expect(other.drawImage).toHaveBeenCalledWith(bitmap, 10, 20, 200, 100);
      r.destroy();
    });

    it("preloadImages gives up after its timeout", async () => {
      vi.useFakeTimers();
      try {
        scene.add(photo);
        const r = new Renderer(canvas, scene, camera, { raf, caf, loadImage: () => new Promise<ImageBitmap>(() => {}) });
        const done = r.preloadImages(500);
        await vi.advanceTimersByTimeAsync(500);
        await expect(done).resolves.toBeUndefined();
        r.destroy();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
