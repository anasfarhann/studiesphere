import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasElement, StrokeEl } from "../model/types";
import type { PreviewTarget } from "./page-preview";
import { PagePreviews, PREVIEW_INTERVAL_MS, type PreviewSink } from "./preview-scheduler";

const stroke = (id: string): StrokeEl => ({
  id, z: 1, updatedAt: 1, type: "stroke", tool: "pen", color: "#111", size: 4,
  points: [[0, 0, 0.5], [100, 100, 0.5]], simulatePressure: false,
});

function setup(opts: { elements?: CanvasElement[]; sink?: Partial<PreviewSink>; draw?: () => boolean } = {}) {
  let els: CanvasElement[] = opts.elements ?? [stroke("a")];
  const listeners = new Set<() => void>();
  const draw = vi.fn(opts.draw ?? (() => true));
  const preload = vi.fn(async () => {});
  const target: PreviewTarget = { elements: () => els, drawSnapshot: draw, preloadImages: preload };
  const sink: PreviewSink = {
    save: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    exists: vi.fn(async () => true),
    ...opts.sink,
  };
  const createCanvas = () =>
    ({
      width: 0,
      height: 0,
      getContext: () => ({}),
      toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(["x"], { type: "image/jpeg" })),
    }) as unknown as HTMLCanvasElement;
  const p = new PagePreviews({
    target,
    sink,
    onChange: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    idle: (cb) => cb(),
    createCanvas,
  });
  const change = () => listeners.forEach((fn) => fn());
  const setElements = (e: CanvasElement[]) => {
    els = e;
  };
  return { p, sink, draw, preload, change, setElements, listeners };
}

/** Lets the chained promises (preload, encode, save) run. */
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("PagePreviews throttle", () => {
  it("generates nothing for a page that is only looked at", async () => {
    const s = setup();
    s.p.start();
    await vi.advanceTimersByTimeAsync(60_000);
    s.p.dispose();
    await settle();
    expect(s.sink.save).not.toHaveBeenCalled();
    expect(s.draw).not.toHaveBeenCalled();
  });

  it("makes at most one preview per 20 s while editing, never synchronously on a change", async () => {
    const s = setup();
    s.p.start();
    s.change();
    expect(s.draw).not.toHaveBeenCalled(); // never on the input event itself
    await vi.advanceTimersByTimeAsync(2_000);
    expect(s.sink.save).toHaveBeenCalledTimes(1);
    expect(s.sink.save).toHaveBeenLastCalledWith(expect.any(Blob), { touch: true });
    const firstAt = Date.now();
    // Edits keep coming: nothing more until 20 s after the first.
    for (let i = 0; i < 10; i++) {
      s.change();
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(s.sink.save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(firstAt + PREVIEW_INTERVAL_MS - Date.now() - 1);
    expect(s.sink.save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.sink.save).toHaveBeenCalledTimes(2);
    s.p.dispose();
  });

  it("waits for the page's photos before drawing", async () => {
    const s = setup();
    s.p.start();
    s.change();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(s.preload).toHaveBeenCalled();
    expect(s.preload.mock.invocationCallOrder[0]).toBeLessThan(s.draw.mock.invocationCallOrder[0]);
    s.p.dispose();
  });

  it("makes one more preview on leave when dirty, drawn at once (before the editor goes)", async () => {
    const s = setup();
    s.p.start();
    s.change();
    s.p.dispose();
    expect(s.draw).toHaveBeenCalledTimes(1);
    await settle();
    expect(s.sink.save).toHaveBeenCalledTimes(1);
    // Nothing left scheduled.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.sink.save).toHaveBeenCalledTimes(1);
    expect(s.listeners.size).toBe(0);
  });

  it("does nothing on leave when clean", async () => {
    const s = setup();
    s.p.start();
    s.change();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(s.sink.save).toHaveBeenCalledTimes(1);
    s.p.dispose();
    await settle();
    expect(s.sink.save).toHaveBeenCalledTimes(1);
  });

  it("flush() (tab hidden) saves now when dirty and keeps watching", async () => {
    const s = setup();
    s.p.start();
    s.change();
    s.p.flush();
    await settle();
    expect(s.sink.save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.sink.save).toHaveBeenCalledTimes(1);
    s.change();
    await vi.advanceTimersByTimeAsync(PREVIEW_INTERVAL_MS);
    expect(s.sink.save).toHaveBeenCalledTimes(2);
    s.p.dispose();
  });

  it("removes the preview when the page was emptied", async () => {
    const s = setup();
    s.p.start();
    s.setElements([]);
    s.change();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(s.sink.save).not.toHaveBeenCalled();
    expect(s.sink.remove).toHaveBeenCalledTimes(1);
    s.p.dispose();
  });
});

describe("PagePreviews first preview", () => {
  it("makes one for a page with content but no preview yet (a copy), without touching the page", async () => {
    const s = setup({ sink: { exists: vi.fn(async () => false) } });
    s.p.start();
    await vi.advanceTimersByTimeAsync(0);
    await settle();
    expect(s.sink.save).toHaveBeenCalledWith(expect.any(Blob), { touch: false });
    s.p.dispose();
  });

  it("does not ask for an empty page", async () => {
    const s = setup({ elements: [], sink: { exists: vi.fn(async () => false) } });
    s.p.start();
    await vi.advanceTimersByTimeAsync(0);
    await settle();
    expect(s.sink.exists).not.toHaveBeenCalled();
    expect(s.sink.save).not.toHaveBeenCalled();
    s.p.dispose();
  });
});

describe("PagePreviews failures are silent", () => {
  it("a failing upload, encode, check or draw never throws and later previews still run", async () => {
    const errors: unknown[] = [];
    const onErr = (e: unknown) => errors.push(e);
    process.on("unhandledRejection", onErr);
    try {
      const save = vi.fn(async () => {
        throw new Error("offline");
      });
      const s = setup({ sink: { save, exists: vi.fn(async () => { throw new Error("offline"); }) } });
      s.p.start();
      s.change();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(save).toHaveBeenCalledTimes(1);
      s.change();
      await vi.advanceTimersByTimeAsync(PREVIEW_INTERVAL_MS);
      expect(save).toHaveBeenCalledTimes(2);
      s.change();
      expect(() => s.p.dispose()).not.toThrow();
      await settle();
      await vi.advanceTimersByTimeAsync(0);
      expect(errors).toEqual([]);
    } finally {
      process.off("unhandledRejection", onErr);
    }
  });

  it("a renderer that throws while drawing is swallowed too", async () => {
    const s = setup({
      draw: () => {
        throw new Error("boom");
      },
    });
    s.p.start();
    s.change();
    await vi.advanceTimersByTimeAsync(2_000);
    s.change();
    expect(() => s.p.dispose()).not.toThrow();
    expect(s.sink.save).not.toHaveBeenCalled();
  });
});
