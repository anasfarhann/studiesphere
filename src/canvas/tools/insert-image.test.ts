import { describe, expect, it, vi } from "vitest";
import { AttachmentError } from "../attachments/upload";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { ImageEl } from "../model/types";
import { PhotoInserter, type PhotoInserterContext, type PhotoStatus } from "./insert-image";

const blob = new Blob(["x"], { type: "image/jpeg" });

function setup(upload: PhotoInserterContext["upload"], size = { width: 2048, height: 1536 }) {
  const scene = new Scene();
  const history = new History();
  const photos = new PhotoInserter({
    scene,
    history,
    ownerId: "own",
    pageId: "pg",
    center: () => [1000, 500],
    upload,
    compress: async () => ({ blob, ...size }),
    newId: () => "img-1",
  });
  const statuses: PhotoStatus[] = [];
  photos.onStatus((s) => statuses.push(s));
  return { scene, history, photos, statuses };
}

const file = new File(["x"], "a.heic", { type: "image/heic" });

describe("PhotoInserter", () => {
  it("adds one centred image, at most 480 wide, as a single undo step", async () => {
    const upload = vi.fn(async () => ({ assetPath: "own/pg/u.jpg" }));
    const { scene, history, photos, statuses } = setup(upload);
    await photos.insert(file);
    const el = scene.get("img-1") as ImageEl;
    expect(el).toMatchObject({ type: "image", assetPath: "own/pg/u.jpg", w: 480, h: 360, x: 760, y: 320 });
    expect(upload).toHaveBeenCalledWith(blob, { ownerId: "own", pageId: "pg", ext: "jpg" });
    expect(statuses.map((s) => s.kind)).toEqual(["uploading", "idle"]);
    history.undo(scene);
    expect(scene.all()).toHaveLength(0);
    expect(history.canUndo()).toBe(false);
  });

  function stamped(upload: PhotoInserterContext["upload"]) {
    let stamp = 0;
    const onInserted = vi.fn();
    const photos = new PhotoInserter({
      scene: new Scene(), history: new History(), ownerId: "o", pageId: "p", center: () => [0, 0], upload,
      compress: async () => ({ blob, width: 100, height: 50 }), newId: () => "img-9", onInserted, stamp: () => stamp,
    });
    return { photos, onInserted, bump: () => void stamp++ };
  }

  it("a prompt insert auto-selects when nothing changed meanwhile", async () => {
    const { photos, onInserted } = stamped(vi.fn(async () => ({ assetPath: "a" })));
    await photos.insert(file);
    expect(onInserted).toHaveBeenCalledExactlyOnceWith("img-9", true);
  });

  it("does not auto-select when the tool or selection changed during the upload", async () => {
    let release!: () => void;
    const { photos, onInserted, bump } = stamped(() => new Promise((r) => { release = () => r({ assetPath: "a" }); }));
    const p = photos.insert(file);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    bump();
    release();
    await p;
    expect(onInserted).toHaveBeenCalledExactlyOnceWith("img-9", false);
  });

  it("a retried upload never auto-selects", async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new AttachmentError("upload_failed", "offline"))
      .mockResolvedValueOnce({ assetPath: "a" });
    const { photos, onInserted } = stamped(upload);
    await photos.insert(file);
    expect(onInserted).not.toHaveBeenCalled();
    await photos.retry();
    expect(onInserted).toHaveBeenCalledExactlyOnceWith("img-9", false);
  });

  it("keeps small photos at their own size", async () => {
    const { scene, photos } = setup(vi.fn(async () => ({ assetPath: "a" })), { width: 200, height: 100 });
    await photos.insert(file);
    expect(scene.get("img-1")).toMatchObject({ w: 200, h: 100 });
  });

  it("a failed upload leaves no element and offers a retry that re-sends the same blob", async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new AttachmentError("upload_failed", "offline"))
      .mockResolvedValueOnce({ assetPath: "own/pg/u.jpg" });
    const { scene, history, photos, statuses } = setup(upload);
    await photos.insert(file);
    expect(scene.all()).toHaveLength(0);
    expect(history.canUndo()).toBe(false);
    expect(photos.status).toEqual({ kind: "error", message: "Couldn't upload — tap to retry", retryable: true });
    await photos.retry();
    expect(upload.mock.calls[1][0]).toBe(upload.mock.calls[0][0]);
    expect(scene.all()).toHaveLength(1);
    expect(statuses[statuses.length - 1]).toEqual({ kind: "idle" });
  });

  it("too-large files show the size message and are not retryable", async () => {
    const { scene, photos } = setup(vi.fn().mockRejectedValue(new AttachmentError("too_large", "This file is larger than 50 MB")));
    await photos.insert(file);
    expect(scene.all()).toHaveLength(0);
    expect(photos.status).toEqual({ kind: "error", message: "This file is larger than 50 MB", retryable: false });
  });

  it("rejects a 51 MB original before compressing or uploading", async () => {
    const upload = vi.fn();
    const compress = vi.fn();
    const photos = new PhotoInserter({
      scene: new Scene(), history: new History(), ownerId: "o", pageId: "p", center: () => [0, 0], upload, compress,
    });
    const big = new File(["x"], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: 51 * 1024 * 1024 });
    await photos.insert(big);
    expect(compress).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(photos.status).toEqual({ kind: "error", message: "This file is larger than 50 MB", retryable: false });
  });

  it("an unreadable image reports an error and never uploads", async () => {
    const upload = vi.fn();
    const photos = new PhotoInserter({
      scene: new Scene(), history: new History(), ownerId: "o", pageId: "p", center: () => [0, 0], upload,
      compress: async () => { throw new Error("bad"); },
    });
    await photos.insert(file);
    expect(upload).not.toHaveBeenCalled();
    expect(photos.status).toMatchObject({ kind: "error", retryable: false });
  });

  it("adds nothing once disposed", async () => {
    const { scene, photos } = setup(vi.fn(async () => ({ assetPath: "a" })));
    const p = photos.insert(file);
    photos.dispose();
    await p;
    expect(scene.all()).toHaveLength(0);
  });
});
