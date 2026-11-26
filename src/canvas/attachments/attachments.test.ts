import { describe, expect, it, vi } from "vitest";
import { AttachmentError, AttachmentService, MAX_ATTACHMENT_BYTES, previewPath, supabaseAttachmentStorage, type AttachmentStorage } from "./upload";

function fakeStorage(over: Partial<AttachmentStorage> = {}) {
  const storage: AttachmentStorage = {
    upload: vi.fn(async () => ({ error: null })),
    createSignedUrl: vi.fn(async (p: string) => ({ url: `https://x/${p}`, error: null })),
    ...over,
  };
  return storage;
}

describe("AttachmentService", () => {
  it("rejects files over 50 MB", async () => {
    const storage = fakeStorage();
    const svc = new AttachmentService(storage);
    const big = new Blob(["x"]);
    Object.defineProperty(big, "size", { value: MAX_ATTACHMENT_BYTES + 1 });
    const err = await svc.uploadAttachment(big, { ownerId: "o", pageId: "p", ext: "jpg" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AttachmentError);
    expect((err as AttachmentError).code).toBe("too_large");
    expect((err as AttachmentError).message).toBe("This file is larger than 50 MB");
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("uploads to {owner}/{page}/{uuid}.{ext}", async () => {
    const storage = fakeStorage();
    const svc = new AttachmentService(storage, () => 0, () => "uuid-1");
    const blob = new Blob(["a"], { type: "image/jpeg" });
    const { assetPath } = await svc.uploadAttachment(blob, { ownerId: "own", pageId: "pg", ext: "JPG" });
    expect(assetPath).toBe("own/pg/uuid-1.jpg");
    expect(storage.upload).toHaveBeenCalledWith("own/pg/uuid-1.jpg", blob, { contentType: "image/jpeg" });
  });

  it("maps storage errors and thrown failures to upload_failed", async () => {
    const a = new AttachmentService(fakeStorage({ upload: async () => ({ error: { message: "nope" } }) }));
    await expect(a.uploadAttachment(new Blob(["a"]), { ownerId: "o", pageId: "p", ext: "png" })).rejects.toMatchObject({
      code: "upload_failed",
    });
    const b = new AttachmentService(fakeStorage({ upload: async () => { throw new Error("offline"); } }));
    await expect(b.uploadAttachment(new Blob(["a"]), { ownerId: "o", pageId: "p", ext: "png" })).rejects.toMatchObject({
      code: "upload_failed",
    });
  });

  it("forgetSignedUrl makes the next call re-sign", async () => {
    const storage = fakeStorage();
    const svc = new AttachmentService(storage);
    await svc.signedUrl("a");
    svc.forgetSignedUrl("a");
    await svc.signedUrl("a");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("caches signed urls for 50 minutes", async () => {
    const storage = fakeStorage();
    let now = 1_000;
    const svc = new AttachmentService(storage, () => now);
    await svc.signedUrl("a/b/c.jpg");
    now += 49 * 60 * 1000;
    await svc.signedUrl("a/b/c.jpg");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(1);
    now += 2 * 60 * 1000;
    await svc.signedUrl("a/b/c.jpg");
    expect(storage.createSignedUrl).toHaveBeenCalledTimes(2);
  });
});

describe("file attachments (Task 18)", () => {
  it("a 51 MB PDF is rejected with the 50 MB message and a 2 MB PDF creates one FileEl", async () => {
    const { FileInserter } = await import("../tools/insert-file");
    const { Scene } = await import("../model/scene");
    const { History } = await import("../model/history");
    const scene = new Scene();
    const svc = new AttachmentService(fakeStorage(), () => 0, () => "u1");
    const mk = (bytes: number) => {
      const f = new File(["x"], "a.pdf", { type: "application/pdf" });
      Object.defineProperty(f, "size", { value: bytes });
      return f;
    };
    const ins = new FileInserter({ scene, history: new History(), ownerId: "o", pageId: "p", center: () => [0, 0], upload: (b, o) => svc.uploadAttachment(b, o), newId: () => "f1" });
    await ins.insert(mk(51 * 1024 * 1024));
    expect(ins.status).toMatchObject({ kind: "error", message: "This file is larger than 50 MB" });
    expect(scene.all()).toHaveLength(0);
    await ins.dismiss();
    await ins.insert(mk(2 * 1024 * 1024));
    expect(scene.all()).toHaveLength(1);
    expect(scene.get("f1")).toMatchObject({ type: "file", fileName: "a.pdf", mime: "application/pdf", bytes: 2 * 1024 * 1024 });
  });
});

describe("page previews (Task 3)", () => {
  it("previewPath is the fixed {owner}/{page}/preview.jpg", () => {
    expect(previewPath("own", "pg")).toBe("own/pg/preview.jpg");
  });

  it("uploadPreview upserts the fixed path as image/jpeg", async () => {
    const storage = fakeStorage();
    const svc = new AttachmentService(storage, () => 0, () => "never");
    const blob = new Blob(["j"], { type: "image/jpeg" });
    await svc.uploadPreview(blob, { ownerId: "own", pageId: "pg" });
    await svc.uploadPreview(blob, { ownerId: "own", pageId: "pg" });
    expect(storage.upload).toHaveBeenCalledTimes(2);
    expect(storage.upload).toHaveBeenNthCalledWith(2, "own/pg/preview.jpg", blob, { contentType: "image/jpeg", upsert: true });
  });

  it("uploadPreview rejects on a storage error (the caller ignores it)", async () => {
    const svc = new AttachmentService(fakeStorage({ upload: async () => ({ error: { message: "nope" } }) }));
    await expect(svc.uploadPreview(new Blob(["j"]), { ownerId: "o", pageId: "p" })).rejects.toThrow("nope");
  });

  it("previewExists signs the fixed path, false when it is missing; removePreview removes it", async () => {
    const remove = vi.fn(async () => ({ error: null }));
    const storage = fakeStorage({
      createSignedUrl: async (p: string) => (p === "o/a/preview.jpg" ? { url: "u", error: null } : { url: null, error: { message: "not found" } }),
      remove,
    });
    const svc = new AttachmentService(storage);
    expect(await svc.previewExists({ ownerId: "o", pageId: "a" })).toBe(true);
    expect(await svc.previewExists({ ownerId: "o", pageId: "b" })).toBe(false);
    await svc.removePreview({ ownerId: "o", pageId: "a" });
    expect(remove).toHaveBeenCalledWith(["o/a/preview.jpg"]);
  });

  it("the Supabase adapter passes upsert only when asked", async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const client = { storage: { from: () => ({ upload, createSignedUrl: vi.fn(), remove: vi.fn() }) } };
    const s = supabaseAttachmentStorage(client);
    const b = new Blob(["x"]);
    await s.upload("o/p/a.jpg", b, { contentType: "image/jpeg" });
    await s.upload("o/p/preview.jpg", b, { contentType: "image/jpeg", upsert: true });
    expect(upload).toHaveBeenNthCalledWith(1, "o/p/a.jpg", b, { contentType: "image/jpeg", upsert: false });
    expect(upload).toHaveBeenNthCalledWith(2, "o/p/preview.jpg", b, { contentType: "image/jpeg", upsert: true });
  });
});
