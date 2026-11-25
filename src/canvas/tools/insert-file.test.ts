import { describe, expect, it, vi } from "vitest";
import { AttachmentError } from "../attachments/upload";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { FileEl } from "../model/types";
import { FileInserter, type FileStatus } from "./insert-file";

function setup(upload: ConstructorParameters<typeof FileInserter>[0]["upload"], thumbnail?: (f: Blob) => Promise<Blob | null>) {
  const scene = new Scene();
  const history = new History();
  const files = new FileInserter({ scene, history, ownerId: "own", pageId: "pg", center: () => [1000, 500], upload, thumbnail, newId: () => "f-1" });
  const statuses: FileStatus[] = [];
  files.onStatus((s) => statuses.push(s));
  return { scene, history, files, statuses };
}
const pdf = new File(["x"], "  Notes.PDF ", { type: "application/pdf" });

describe("FileInserter", () => {
  it("adds one centred card as a single undo step; uploads original bytes with ext and type", async () => {
    const upload = vi.fn(async () => ({ assetPath: "own/pg/u.pdf" }));
    const { scene, history, files, statuses } = setup(upload);
    await files.insert(pdf);
    expect(scene.get("f-1") as FileEl).toMatchObject({ type: "file", assetPath: "own/pg/u.pdf", fileName: "Notes.PDF", mime: "application/pdf", bytes: 1, x: 880, y: 468 });
    expect(upload).toHaveBeenCalledWith(pdf, { ownerId: "own", pageId: "pg", ext: "pdf" });
    expect(statuses.map((s) => s.kind)).toEqual(["uploading", "idle"]);
    history.undo(scene);
    expect(scene.all()).toHaveLength(0);
  });

  it("uses octet-stream and .bin when the type and extension are unknown", async () => {
    const upload = vi.fn(async (...args: [Blob, unknown]) => (void args, { assetPath: "a" }));
    const { scene, files } = setup(upload);
    await files.insert(new File(["x"], "README", { type: "" }));
    expect(scene.get("f-1")).toMatchObject({ mime: "application/octet-stream", fileName: "README" });
    expect(upload.mock.calls[0][1]).toMatchObject({ ext: "bin" });
    expect(upload.mock.calls[0][0].type).toBe("application/octet-stream");
  });

  it("rejects a 51 MB PDF before uploading, with the 50 MB message", async () => {
    const upload = vi.fn();
    const { scene, files } = setup(upload);
    const big = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 51 * 1024 * 1024 });
    await files.insert(big);
    expect(upload).not.toHaveBeenCalled();
    expect(scene.all()).toHaveLength(0);
    expect(files.status).toEqual({ kind: "error", message: "This file is larger than 50 MB", retryable: false });
  });

  it("a failed upload adds nothing; retry re-sends the same file; busy guard", async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new AttachmentError("upload_failed", "offline"))
      .mockResolvedValueOnce({ assetPath: "own/pg/u.pdf" });
    const { scene, history, files } = setup(upload);
    await files.insert(pdf);
    expect(scene.all()).toHaveLength(0);
    expect(history.canUndo()).toBe(false);
    expect(files.status).toMatchObject({ kind: "error", retryable: true });
    await Promise.all([files.retry(), files.retry()]);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1][0].size).toBe(upload.mock.calls[0][0].size);
    expect(scene.all()).toHaveLength(1);
  });

  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("uploads a PDF thumbnail after the file and sets thumbPath without an extra undo step", async () => {
    const upload = vi.fn(async (_b: Blob, o: { ext: string }) => ({ assetPath: o.ext === "pdf" ? "own/pg/u.pdf" : "own/pg/u.thumb.jpg" }));
    const thumb = new Blob(["j"], { type: "image/jpeg" });
    const { scene, history, files } = setup(upload, async () => thumb);
    await files.insert(pdf);
    await settle();
    expect(upload.mock.calls.map((c) => c[1].ext)).toEqual(["pdf", "thumb.jpg"]);
    expect(upload.mock.calls[1][0]).toBe(thumb);
    expect(scene.get("f-1")).toMatchObject({ assetPath: "own/pg/u.pdf", thumbPath: "own/pg/u.thumb.jpg" });
    history.undo(scene);
    expect(scene.all()).toHaveLength(0);
    history.redo(scene);
    expect(scene.get("f-1")).toMatchObject({ thumbPath: "own/pg/u.thumb.jpg" });
    expect(history.canUndo()).toBe(true);
    history.undo(scene);
    expect(history.canUndo()).toBe(false);
  });

  it("a thumbnail failure (render or upload) leaves the card without one and the status idle", async () => {
    const upload = vi.fn().mockResolvedValueOnce({ assetPath: "own/pg/u.pdf" }).mockRejectedValueOnce(new Error("offline"));
    const { scene, files } = setup(upload, async () => new Blob(["j"]));
    await files.insert(pdf);
    await settle();
    expect(files.status).toEqual({ kind: "idle" });
    expect((scene.get("f-1") as FileEl).thumbPath).toBeUndefined();
    const { scene: s2, files: f2 } = setup(async () => ({ assetPath: "a" }), async () => null);
    await f2.insert(pdf);
    await settle();
    expect((s2.get("f-1") as FileEl).thumbPath).toBeUndefined();
  });

  it("never renders a thumbnail for non-PDFs", async () => {
    const thumbnail = vi.fn(async () => new Blob(["j"]));
    const { files } = setup(async () => ({ assetPath: "a" }), thumbnail);
    await files.insert(new File(["x"], "a.txt", { type: "text/plain" }));
    await settle();
    expect(thumbnail).not.toHaveBeenCalled();
  });

  it("a card moved while the preview renders redoes at its original spot and keeps thumbPath", async () => {
    const upload = vi.fn(async (_b: Blob, o: { ext: string }) => ({ assetPath: o.ext === "pdf" ? "own/pg/u.pdf" : "own/pg/u.thumb.jpg" }));
    let release!: (b: Blob) => void;
    const { scene, history, files } = setup(upload, () => new Promise<Blob | null>((r) => (release = r)));
    await files.insert(pdf);
    scene.update("f-1", { x: 5000, y: 6000 });
    release(new Blob(["j"]));
    await settle();
    expect(scene.get("f-1")).toMatchObject({ x: 5000, y: 6000, thumbPath: "own/pg/u.thumb.jpg" });
    history.undo(scene);
    history.redo(scene);
    expect(scene.get("f-1")).toMatchObject({ x: 880, y: 468, thumbPath: "own/pg/u.thumb.jpg" });
  });
});
