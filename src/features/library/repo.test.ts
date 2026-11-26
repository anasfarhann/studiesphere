import { beforeEach, describe, expect, it } from "vitest";
import { MemoryLibraryRepo } from "./memory-repo";
import { FolderNotEmptyError } from "./repo";

let repo: MemoryLibraryRepo;
beforeEach(() => {
  repo = new MemoryLibraryRepo();
});

describe("MemoryLibraryRepo", () => {
  it("creating a subject returns it in listSubjects", async () => {
    const s = await repo.createSubject({ name: "Biology", color: "#16a34a" });
    expect(s.name).toBe("Biology");
    expect(await repo.listSubjects()).toEqual([s]);
  });

  it("createPage twice gives sort_order 0 then 1", async () => {
    const s = await repo.createSubject({ name: "Bio", color: "#16a34a" });
    const n = await repo.createNotebook(s.id, "Cells");
    const a = await repo.createPage(n.id);
    const b = await repo.createPage(n.id);
    expect([a.sort_order, b.sort_order]).toEqual([0, 1]);
    expect(a.title).toBe("Untitled");
    expect((await repo.listPages(n.id)).map((p) => p.id)).toEqual([a.id, b.id]);
  });

  it("deleting an empty folder removes it and its empty notebooks only", async () => {
    const s = await repo.createSubject({ name: "Bio", color: "#16a34a" });
    const other = await repo.createSubject({ name: "Chem", color: "#2563eb" });
    await repo.createNotebook(s.id, "Pages");
    const keep = await repo.createNotebook(other.id, "Atoms");
    await repo.deleteSubject(s.id);
    expect(await repo.listNotebooks(s.id)).toEqual([]);
    expect((await repo.listSubjects()).map((x) => x.id)).toEqual([other.id]);
    expect(await repo.listNotebooks(other.id)).toEqual([keep]);
  });

  it("refuses to delete a folder that has pages, in any of its notebooks, and keeps everything", async () => {
    const s = await repo.createSubject({ name: "Bio", color: "#16a34a" });
    await repo.createNotebook(s.id, "Pages");
    const old = await repo.createNotebook(s.id, "Cells");
    const p = await repo.createPage(old.id);
    const err = await repo.deleteSubject(s.id).catch((e) => e);
    expect(err).toBeInstanceOf(FolderNotEmptyError);
    expect((await repo.listSubjects()).map((x) => x.id)).toEqual([s.id]);
    expect((await repo.listFolderPages(s.id)).map((x) => x.id)).toEqual([p.id]);
  });

  it("lists a folder's pages from all its notebooks, newest first, and nothing from other folders", async () => {
    const s = await repo.createSubject({ name: "Bio", color: "#16a34a" });
    const other = await repo.createSubject({ name: "Chem", color: "#2563eb" });
    const cells = await repo.createNotebook(s.id, "Cells");
    const pagesNb = await repo.createNotebook(s.id, "Pages");
    const a = await repo.createPage(cells.id, "A");
    const b = await repo.createPage(pagesNb.id, "B");
    const c = await repo.createPage(cells.id, "C");
    await repo.createPage((await repo.createNotebook(other.id, "Atoms")).id, "Elsewhere");
    expect((await repo.listFolderPages(s.id)).map((x) => x.id)).toEqual([c.id, b.id, a.id]);
    expect(await repo.listFolderPages("missing")).toEqual([]);
  });

  it("empty subject name throws 'Name is required'", async () => {
    await expect(repo.createSubject({ name: "   ", color: "#000000" })).rejects.toThrow("Name is required");
    await expect(repo.createNotebook("x", "")).rejects.toThrow("Name is required");
  });

  it("renames a subject and rejects a blank rename", async () => {
    const s = await repo.createSubject({ name: "Bio", color: "#16a34a" });
    await repo.renameSubject(s.id, " Biology ");
    expect((await repo.listSubjects())[0].name).toBe("Biology");
    await expect(repo.renameSubject(s.id, "")).rejects.toThrow("Name is required");
  });
});
