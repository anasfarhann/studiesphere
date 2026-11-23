import { describe, expect, it, vi } from "vitest";
import { AttachmentError } from "../attachments/upload";
import { History } from "../model/history";
import { Scene } from "../model/scene";
import type { FileEl } from "../model/types";
import { FileInserter, type FileStatus } from "./insert-file";

function setup(upload: ConstructorParameters<typeof FileInserter>[0]["upload"]) {
  const scene = new Scene();
  const history = new History();
  const files = new FileInserter({ scene, history, ownerId: "own", pageId: "pg", center: () => [1000, 500], upload, newId: () => "f-1" });
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
});
