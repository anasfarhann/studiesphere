import { describe, expect, it, vi } from "vitest";
import { AttachmentError, AttachmentService, MAX_ATTACHMENT_BYTES, type AttachmentStorage } from "./upload";

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
