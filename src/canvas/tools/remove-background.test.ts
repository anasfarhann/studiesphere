import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AttachmentError } from "../attachments/upload";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { ImageEl } from "../model/types";
import { BackgroundRemover, MAX_BG_SIDE, type BackgroundStatus, type RemoveBackgroundFn } from "./remove-background";
import { RemovalProgress } from "./remove-background-progress";
import { fitWithin } from "./remove-background-protocol";

const photo: ImageEl = { id: "img", type: "image", x: 10, y: 20, w: 300, h: 200, assetPath: "o/p/a.jpg", crop: { x: 0.1, y: 0, w: 0.8, h: 1 }, z: 0, updatedAt: 1 };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(remove: RemoveBackgroundFn, upload = vi.fn(async () => ({ assetPath: "o/p/new.png" }))) {
  const scene = new Scene([{ ...photo }]);
  const history = new History();
  const fetchOriginal = vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" }));
  const r = new BackgroundRemover({ scene, history, ownerId: "o", pageId: "p", fetchOriginal, upload, remove });
  const statuses: BackgroundStatus[] = [];
  r.onStatus((s) => statuses.push(s));
  return { scene, history, r, statuses, fetchOriginal, upload };
}

const png = new Blob(["png"], { type: "image/png" });

describe("BackgroundRemover", () => {
  it("replaces the photo's asset with the uploaded PNG, keeping position, size and crop; one undo restores it", async () => {
    const remove = vi.fn<RemoveBackgroundFn>(async (_img, o) => {
      o.onProgress(0.5, "compute");
      return png;
    });
    const { scene, history, r, statuses, fetchOriginal, upload } = setup(remove);
    await r.start("img");
    expect(fetchOriginal).toHaveBeenCalledWith("o/p/a.jpg");
    expect(remove.mock.calls[0][1].maxSide).toBe(MAX_BG_SIDE);
    expect(upload).toHaveBeenCalledWith(png, { ownerId: "o", pageId: "p", ext: "png" });
    expect(scene.get("img")).toMatchObject({ assetPath: "o/p/new.png", x: 10, y: 20, w: 300, h: 200, crop: photo.crop });
    expect(r.status).toEqual({ kind: "idle" });
    expect(statuses.some((s) => s.kind === "working" && s.percent > 0 && s.percent < 100)).toBe(true);
    history.undo(scene);
    expect(scene.get("img")).toMatchObject({ assetPath: "o/p/a.jpg", crop: photo.crop });
    expect(history.canUndo()).toBe(false);
    history.redo(scene);
    expect((scene.get("img") as ImageEl).assetPath).toBe("o/p/new.png");
  });

  it("reports rising percentages while working, with the download flag during the model download", async () => {
    const step = deferred<Blob>();
    const remove: RemoveBackgroundFn = (_i, o) => {
      o.onProgress(0.2, "download");
      o.onProgress(0.1, "download"); // never goes backwards
      o.onProgress(0.8, "compute");
      return step.promise;
    };
    const { r, statuses } = setup(remove);
    const run = r.start("img");
    await vi.waitFor(() => expect(r.status).toMatchObject({ kind: "working", downloading: false }));
    const working = statuses.filter((s): s is Extract<BackgroundStatus, { kind: "working" }> => s.kind === "working");
    const pcts = working.map((s) => s.percent);
    expect(pcts).toEqual([...pcts].sort((a, b) => a - b));
    expect(working.some((s) => s.downloading)).toBe(true);
    expect(pcts.at(-1)).toBeGreaterThan(50);
    expect(pcts.at(-1)).toBeLessThan(100);
    step.resolve(png);
    await run;
  });

  it("cancel aborts the removal and leaves the element unchanged, with nothing to undo", async () => {
    let signal: AbortSignal | null = null;
    const step = deferred<Blob>();
    const { scene, history, r, upload } = setup((_i, o) => {
      signal = o.signal;
      return step.promise;
    });
    const run = r.start("img");
    await vi.waitFor(() => expect(signal).not.toBeNull());
    r.cancel();
    expect(signal!.aborted).toBe(true);
    expect(r.status).toEqual({ kind: "idle" });
    step.resolve(png); // a late result is ignored
    await run;
    expect(upload).not.toHaveBeenCalled();
    expect(scene.get("img")).toEqual(photo);
    expect(history.canUndo()).toBe(false);
    expect(r.busy).toBe(false);
  });

  it("a failure shows a friendly message and changes nothing", async () => {
    const { scene, history, r } = setup(async () => {
      throw new Error("Failed to create session");
    });
    await r.start("img");
    expect(r.status).toEqual({ kind: "error", message: "Couldn't remove the background. The photo is unchanged." });
    expect(scene.get("img")).toEqual(photo);
    expect(history.canUndo()).toBe(false);
    r.dismiss();
    expect(r.status).toEqual({ kind: "idle" });
  });

  it("an upload failure changes nothing; a too-large result says so", async () => {
    const failing = setup(async () => png, vi.fn(async () => Promise.reject(new AttachmentError("too_large", "x"))));
    await failing.r.start("img");
    expect(failing.r.status).toMatchObject({ kind: "error", message: "This file is larger than 50 MB" });
    expect(failing.scene.get("img")).toEqual(photo);
  });

  it("drops the result when the photo was removed or changed meanwhile", async () => {
    const step = deferred<Blob>();
    const { scene, history, r } = setup(() => step.promise);
    const run = r.start("img");
    await vi.waitFor(() => expect(r.status.kind).toBe("working"));
    scene.update("img", { assetPath: "o/p/other.jpg" });
    step.resolve(png);
    await run;
    expect((scene.get("img") as ImageEl).assetPath).toBe("o/p/other.jpg");
    expect(history.canUndo()).toBe(false);
  });

  it("one run at a time; a repeat on a processed photo works", async () => {
    const remove = vi.fn<RemoveBackgroundFn>(async () => png);
    let n = 0;
    const { scene, r } = setup(remove, vi.fn(async () => ({ assetPath: `o/p/n${++n}.png` })));
    const a = r.start("img");
    const b = r.start("img");
    await Promise.all([a, b]);
    expect(remove).toHaveBeenCalledTimes(1);
    await r.start("img");
    expect((scene.get("img") as ImageEl).assetPath).toBe("o/p/n2.png");
  });
});

describe("RemovalProgress", () => {
  it("weights downloads by bytes (estimates until real totals arrive), then computing", () => {
    const p = new RemovalProgress({ "fetch:/models/m": 80, "fetch:/w.wasm": 20 });
    expect(p.update("fetch:/models/m", 40, 80)).toEqual({ fraction: 0.6 * 0.4, phase: "download" });
    expect(p.update("fetch:/models/m", 80, 80).fraction).toBeCloseTo(0.6 * 0.8);
    expect(p.update("fetch:/w.wasm", 20, 20).fraction).toBeCloseTo(0.6);
    expect(p.update("compute:inference", 1, 4)).toEqual({ fraction: 0.6 + 0.4 * 0.25, phase: "compute" });
    expect(p.update("compute:encode", 4, 4).fraction).toBeCloseTo(1);
  });
});

describe("fitWithin", () => {
  it("scales a large photo's long side to the limit, keeping its aspect; small ones stay", () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ w: 2048, h: 1536 });
    expect(fitWithin(3024, 4032, 2048)).toEqual({ w: 1536, h: 2048 });
    expect(fitWithin(800, 600, 2048)).toEqual({ w: 800, h: 600 });
  });
});

describe("lazy loading", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }

  it("only the worker imports the library, and the worker client is only reached through a dynamic import", () => {
    const src = join(__dirname, "..", "..");
    const lib = files(src).filter((f) => readFileSync(f, "utf8").includes("@imgly/background-removal") && !f.endsWith(".test.ts"));
    expect(lib.map((f) => f.slice(src.length))).toEqual([join("/canvas/tools/remove-background.worker.ts")]);
    const staticClient = files(src).filter((f) => /from\s+["'][^"']*remove-background-client["']/.test(readFileSync(f, "utf8")));
    expect(staticClient).toEqual([]);
    expect(readFileSync(join(__dirname, "remove-background.ts"), "utf8")).toMatch(/import\("\.\/remove-background-client"\)/);
  });
});
