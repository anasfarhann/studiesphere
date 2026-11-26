import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  ensure: vi.fn(),
  ensureFolder: vi.fn(),
  createPage: vi.fn(),
  renameSubject: vi.fn(),
  deleteSubject: vi.fn(),
  redirect: vi.fn(),
  renamePage: vi.fn(),
  movePage: vi.fn(),
  duplicatePage: vi.fn(),
  deletePage: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: m.redirect, unstable_rethrow: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("./page-ops", () => ({ renamePage: m.renamePage, movePage: m.movePage, duplicatePage: m.duplicatePage, deletePage: m.deletePage }));
vi.mock("@/lib/auth", () => ({ getUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));
vi.mock("./supabase-repo", () => ({
  SupabaseLibraryRepo: class {
    createPage = m.createPage;
    renameSubject = m.renameSubject;
    deleteSubject = m.deleteSubject;
  },
}));
vi.mock("./quick-notes", async (orig) => ({ ...(await orig<typeof import("./quick-notes")>()), ensureQuickNotebook: m.ensure, ensureFolderNotebook: m.ensureFolder }));

import { createFolderPageAction, deletePageAction, duplicatePageAction, movePageAction, renamePageAction, createQuickPageAction, deleteFolderAction, renameFolderAction } from "./actions";
import { FolderNotEmptyError, ValidationError } from "./repo";

beforeEach(() => {
  vi.clearAllMocks();
  m.ensure.mockResolvedValue("nb1");
  m.ensureFolder.mockResolvedValue("nbF");
  m.renameSubject.mockResolvedValue(undefined);
  m.deleteSubject.mockResolvedValue(undefined);
  m.createPage.mockResolvedValue({ id: "p9" });
  vi.useRealTimers();
});

describe("createQuickPageAction", () => {
  it("creates a page in the quick notebook titled with the user's local date, then redirects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T20:00:00Z"));
    const f = new FormData();
    f.set("tz", "Asia/Kuala_Lumpur");
    await createQuickPageAction(null, f);
    expect(m.createPage).toHaveBeenCalledWith("nb1", "Page · 25 Nov");
    expect(m.redirect).toHaveBeenCalledWith("/app/p/p9");
  });
  it("falls back to UTC for a bad zone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T20:00:00Z"));
    const f = new FormData();
    f.set("tz", "bogus");
    await createQuickPageAction(null, f);
    expect(m.createPage).toHaveBeenCalledWith("nb1", "Page · 24 Nov");
  });
  it("returns a translated form error instead of throwing when creating fails, and does not redirect", async () => {
    m.createPage.mockRejectedValue(new Error("db down: secret detail"));
    const f = new FormData();
    f.set("tz", "UTC");
    await expect(createQuickPageAction(null, f)).resolves.toEqual({ error: "Something went wrong, please try again" });
    expect(m.redirect).not.toHaveBeenCalled();
    m.ensure.mockRejectedValue(new Error("no notebook"));
    await expect(createQuickPageAction(null, f)).resolves.toEqual({ error: "Something went wrong, please try again" });
  });
});

describe("createFolderPageAction", () => {
  it("creates a dated page in the folder's hidden notebook and opens it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T20:00:00Z"));
    const f = new FormData();
    f.set("tz", "Asia/Kuala_Lumpur");
    await createFolderPageAction("f1", null, f);
    expect(m.ensureFolder).toHaveBeenCalledWith(expect.anything(), "u1", "f1");
    expect(m.createPage).toHaveBeenCalledWith("nbF", "Page · 25 Nov");
    expect(m.redirect).toHaveBeenCalledWith("/app/p/p9");
  });
  it("returns a form error and does not redirect when it fails", async () => {
    m.ensureFolder.mockRejectedValue(new Error("nope"));
    await expect(createFolderPageAction("f1", null, new FormData())).resolves.toEqual({ error: "Something went wrong, please try again" });
    expect(m.redirect).not.toHaveBeenCalled();
  });
});

describe("renameFolderAction", () => {
  it("renames and returns no error", async () => {
    const f = new FormData();
    f.set("name", "Chemistry");
    await expect(renameFolderAction("f1", null, f)).resolves.toBeNull();
    expect(m.renameSubject).toHaveBeenCalledWith("f1", "Chemistry");
  });
});

describe("deleteFolderAction", () => {
  it("deletes an empty folder and goes home", async () => {
    await deleteFolderAction("f1");
    expect(m.deleteSubject).toHaveBeenCalledWith("f1");
    expect(m.redirect).toHaveBeenCalledWith("/app");
  });
  it("is refused with a message when the folder has pages", async () => {
    m.deleteSubject.mockRejectedValue(new FolderNotEmptyError());
    await expect(deleteFolderAction("f1")).resolves.toEqual({
      error: "This folder still has pages. Delete or move them first.",
    });
    expect(m.redirect).not.toHaveBeenCalled();
  });
});

describe("page actions", () => {
  beforeEach(() => {
    for (const k of ["renamePage", "movePage", "duplicatePage", "deletePage"] as const) m[k].mockResolvedValue(undefined);
  });
  it("rename passes the signed-in owner and the new title, refreshes /app, returns null", async () => {
    const f = new FormData();
    f.set("title", "Mitosis");
    await expect(renamePageAction("p1", null, f)).resolves.toBeNull();
    expect(m.renamePage).toHaveBeenCalledWith(expect.anything(), "u1", "p1", "Mitosis");
    expect(m.revalidate).toHaveBeenCalledWith("/app", "layout");
  });
  it("move passes the target folder", async () => {
    const f = new FormData();
    f.set("folderId", "f2");
    await expect(movePageAction("p1", null, f)).resolves.toBeNull();
    expect(m.movePage).toHaveBeenCalledWith(expect.anything(), "u1", "p1", "f2");
  });
  it("duplicate and delete are owner scoped", async () => {
    await expect(duplicatePageAction("p1")).resolves.toBeNull();
    expect(m.duplicatePage).toHaveBeenCalledWith(expect.anything(), "u1", "p1");
    await expect(deletePageAction("p1")).resolves.toBeNull();
    expect(m.deletePage).toHaveBeenCalledWith(expect.anything(), "u1", "p1");
  });
  it("failures become translated form errors and do not refresh", async () => {
    m.deletePage.mockRejectedValue(new Error("secret detail"));
    await expect(deletePageAction("p1")).resolves.toEqual({ error: "Something went wrong, please try again" });
    m.renamePage.mockRejectedValue(new ValidationError("x"));
    await expect(renamePageAction("p1", null, new FormData())).resolves.toEqual({ error: "Name is required" });
    expect(m.revalidate).not.toHaveBeenCalled();
  });
});
