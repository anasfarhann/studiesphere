import { describe, expect, it, vi } from "vitest";
import { signPreviewUrls, touchPage, withVersion, type PreviewSigner } from "./previews";

function storageWith(createSignedUrls: (paths: string[], ttl: number) => Promise<unknown>) {
  const from = vi.fn(() => ({ createSignedUrls }));
  return { client: { storage: { from } } as unknown as PreviewSigner, from };
}

describe("withVersion", () => {
  it("appends v=<updated_at> to a signed URL", () => {
    expect(withVersion("https://s/x.jpg?token=abc", "2026-11-26T10:00:00.123+00:00")).toBe(
      "https://s/x.jpg?token=abc&v=2026-11-26T10%3A00%3A00.123%2B00%3A00",
    );
    expect(withVersion("https://s/x.jpg", "1")).toBe("https://s/x.jpg?v=1");
  });
});

describe("signPreviewUrls", () => {
  it("signs every page's preview in one batch, cache-busted by updated_at; missing ones are left out", async () => {
    const sign = vi.fn(async (paths: string[]) => ({
      data: paths.map((path) =>
        path === "u1/p2/preview.jpg" ? { path, signedUrl: null, error: "Object not found" } : { path, signedUrl: `https://s/${path}?token=t`, error: null },
      ),
      error: null,
    }));
    const { client, from } = storageWith(sign);
    const urls = await signPreviewUrls(client, "u1", [
      { id: "p1", updated_at: "A" },
      { id: "p2", updated_at: "B" },
    ]);
    expect(from).toHaveBeenCalledWith("attachments");
    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign.mock.calls[0][0]).toEqual(["u1/p1/preview.jpg", "u1/p2/preview.jpg"]);
    expect(urls).toEqual({ p1: "https://s/u1/p1/preview.jpg?token=t&v=A" });
  });

  it("asks nothing for no pages", async () => {
    const sign = vi.fn();
    const { client } = storageWith(sign);
    expect(await signPreviewUrls(client, "u1", [])).toEqual({});
    expect(sign).not.toHaveBeenCalled();
  });

  it("swallows failures: no previews, the cards show their placeholders", async () => {
    const a = storageWith(async () => ({ data: null, error: { message: "down" } }));
    expect(await signPreviewUrls(a.client, "u1", [{ id: "p1", updated_at: "A" }])).toEqual({});
    const b = storageWith(async () => {
      throw new Error("offline");
    });
    expect(await signPreviewUrls(b.client, "u1", [{ id: "p1", updated_at: "A" }])).toEqual({});
  });
});

describe("touchPage", () => {
  it("bumps pages.updated_at with an owner-scoped update", async () => {
    const eq2 = vi.fn(async () => ({ error: null }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const update = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ update }));
    await touchPage({ from } as never, "u1", "p1");
    expect(from).toHaveBeenCalledWith("pages");
    expect(update).toHaveBeenCalledWith({ updated_at: expect.any(String) });
    expect(eq1).toHaveBeenCalledWith("id", "p1");
    expect(eq2).toHaveBeenCalledWith("owner_id", "u1");
  });

  it("rejects on an error (the preview sink ignores it)", async () => {
    const from = () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: { message: "rls" } }) }) }) });
    await expect(touchPage({ from } as never, "u1", "p1")).rejects.toThrow("rls");
  });
});
