import { beforeEach, describe, expect, it } from "vitest";
import { MemoryLibraryRepo } from "./memory-repo";

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

  it("deleting a subject removes its notebooks and pages", async () => {
    const s = await repo.createSubject({ name: "Bio", color: "#16a34a" });
    const other = await repo.createSubject({ name: "Chem", color: "#2563eb" });
    const n = await repo.createNotebook(s.id, "Cells");
    const keep = await repo.createNotebook(other.id, "Atoms");
    await repo.createPage(n.id);
    await repo.deleteSubject(s.id);
    expect(await repo.listNotebooks(s.id)).toEqual([]);
    expect(await repo.listPages(n.id)).toEqual([]);
    expect(await repo.listNotebooks(other.id)).toEqual([keep]);
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
