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
    moveTo: vi.fn(rec("moveTo")), lineTo: vi.fn(rec("lineTo")),
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
    expect(ctx.fill).toHaveBeenCalledTimes(1);
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
    expect(alphas).toEqual([0.35]);
    expect(ctx.globalAlpha).toBe(1);
  });

  it("draws live stroke on top without caching, and selection boxes", () => {
    scene.add(stroke("a", 10));
    const r = make();
    r.resize(200, 200, 1);
    r.setLive(stroke("live", 30));
    r.setSelection(["a"]);
    flush();
    expect(ctx.fill).toHaveBeenCalledTimes(2);
    expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    r.requestFrame(); flush();
    expect(ctx.fill).toHaveBeenCalledTimes(4);
  });

  it("draws text lines and placeholder cards", () => {
    const els: CanvasElement[] = [
      { id: "t", z: 1, updatedAt: 1, type: "text", x: 0, y: 0, w: 100, text: "a\nb", fontSize: 16, color: "#000" },
      { id: "f", z: 2, updatedAt: 1, type: "file", x: 0, y: 100, assetPath: "p", fileName: "f", mime: "x", bytes: 1 },
    ];
    els.forEach((e) => scene.add(e));
    const r = make();
    r.resize(400, 400, 1);
    flush();
    expect(ctx.fillText).toHaveBeenCalledTimes(2);
    expect(ctx.roundRect).toHaveBeenCalledTimes(1);
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
});
