import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import { deletePage, duplicatePage, movePage, renamePage } from "./page-ops";
import { ValidationError } from "./repo";

type Row = Record<string, unknown>;

/** Minimal in-memory stand-in for the query builder shapes page-ops uses (select/insert/update/delete + eq/in/order/range/limit). */
function fakeDb(seed: Record<string, Row[]>, opts: { failElementInsert?: boolean } = {}) {
  const tables: Record<string, Row[]> = { subjects: [], notebooks: [], pages: [], canvas_elements: [], ...seed };
  let n = 0;
  const log: string[] = [];
  const db = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      let inF: [string, unknown[]] | undefined;
      const orders: [string, boolean][] = [];
      let lim: number | undefined;
      let rng: [number, number] | undefined;
      let mode: "select" | "update" | "delete" = "select";
      let patch: Row = {};
      const match = (x: Row) => filters.every(([k, v]) => x[k] === v) && (!inF || inF[1].includes(x[inF[0]]));
      const run = () => {
        if (mode === "update") {
          const hit = tables[table].filter(match);
          for (const r of hit) Object.assign(r, patch);
          return hit;
        }
        if (mode === "delete") {
          const hit = tables[table].filter(match);
          tables[table] = tables[table].filter((x) => !match(x));
          return hit;
        }
        let r = tables[table].filter(match);
        for (const [k, asc] of [...orders].reverse()) r = [...r].sort((a, b) => ((a[k] as number) < (b[k] as number) ? -1 : (a[k] as number) > (b[k] as number) ? 1 : 0) * (asc ? 1 : -1));
        if (rng) r = r.slice(rng[0], rng[1] + 1);
        return lim ? r.slice(0, lim) : r;
      };
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push([k, v]), q),
        in: (k: string, v: unknown[]) => ((inF = [k, v]), q),
        order: (k: string, o?: { ascending: boolean }) => (orders.push([k, o?.ascending !== false]), q),
        limit: (m: number) => ((lim = m), q),
        range: (a: number, b: number) => ((rng = [a, b]), q),
        update: (p: Row) => ((mode = "update"), (patch = p), q),
        delete: () => ((mode = "delete"), log.push(`delete ${table}`), q),
        single: async () => {
          const r = run();
          return r.length ? { data: r[0], error: null } : { data: null, error: { message: "no rows" } };
        },
        insert: (row: Row | Row[]) => {
          const rows = (Array.isArray(row) ? row : [row]).map((r) => ({ owner_id: "u1", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...r, id: (r.id as string) ?? `${table}-${++n}` }));
          if (table === "canvas_elements" && opts.failElementInsert) return { then: (res: (v: unknown) => unknown) => res({ data: null, error: { message: "boom" } }) };
          tables[table].push(...rows);
          const out = { data: rows, error: null };
          const chain = { select: () => ({ single: async () => ({ data: rows[0], error: null }), then: (res: (v: unknown) => unknown) => res(out) }), then: (res: (v: unknown) => unknown) => res({ error: null }) };
          return chain;
        },
        then: (res: (v: unknown) => unknown) => res({ data: run(), error: null }),
      };
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient<Database>, tables: () => tables, log };
}

const base = () => ({
  subjects: [
    { id: "f1", owner_id: "u1", name: "Bio" },
    { id: "f2", owner_id: "u1", name: "Chem" },
    { id: "fx", owner_id: "u2", name: "Other" },
  ],
  notebooks: [
    { id: "nb1", owner_id: "u1", subject_id: "f1", title: "Pages", created_at: "2026-01-01T00:00:00Z" },
    { id: "nb2", owner_id: "u1", subject_id: "f2", title: "Pages", created_at: "2026-01-01T00:00:00Z" },
  ],
  pages: [
    { id: "p1", owner_id: "u1", notebook_id: "nb1", title: "Cells", sort_order: 0 },
    { id: "px", owner_id: "u2", notebook_id: "nbx", title: "Theirs", sort_order: 0 },
  ],
  canvas_elements: [
    { id: "e1", owner_id: "u1", page_id: "p1", type: "stroke", z: 1, updated_at: "2020-01-01T00:00:00.000Z", deleted: false, data: { id: "e1", type: "stroke", z: 1, updatedAt: 5 } },
    { id: "e2", owner_id: "u1", page_id: "p1", type: "image", z: 2, updated_at: "2020-02-02T00:00:00.000Z", deleted: false, data: { id: "e2", type: "image", path: "u1/p1/a.png", z: 2, updatedAt: 6 } },
    { id: "e3", owner_id: "u1", page_id: "p1", type: "stroke", z: 3, deleted: true, data: { id: "e3", type: "stroke" } },
  ],
});

describe("renamePage", () => {
  it("renames an owned page and trims", async () => {
    const f = fakeDb(base());
    await renamePage(f.db, "u1", "p1", "  Mitosis ");
    expect(f.tables().pages[0].title).toBe("Mitosis");
  });
  it("rejects a blank name", async () => {
    await expect(renamePage(fakeDb(base()).db, "u1", "p1", "  ")).rejects.toBeInstanceOf(ValidationError);
  });
  it("never touches another owner's page", async () => {
    const f = fakeDb(base());
    await expect(renamePage(f.db, "u1", "px", "Mine now")).rejects.toThrow();
    expect(f.tables().pages[1].title).toBe("Theirs");
  });
});

describe("deletePage", () => {
  it("deletes only the owner's page", async () => {
    const f = fakeDb(base());
    await expect(deletePage(f.db, "u1", "px")).rejects.toThrow();
    expect(f.tables().pages).toHaveLength(2);
    await deletePage(f.db, "u1", "p1");
    expect(f.tables().pages.map((p) => p.id)).toEqual(["px"]);
  });
});

describe("movePage", () => {
  it("points the page at the target folder's notebook", async () => {
    const f = fakeDb(base());
    await movePage(f.db, "u1", "p1", "f2");
    expect(f.tables().pages[0].notebook_id).toBe("nb2");
  });
  it("creates the target's Pages notebook when it has none, and is idempotent", async () => {
    const seed = base();
    seed.notebooks = seed.notebooks.filter((n) => n.id !== "nb2");
    const f = fakeDb(seed);
    await movePage(f.db, "u1", "p1", "f2");
    const target = f.tables().pages[0].notebook_id;
    expect(f.tables().notebooks.find((n) => n.id === target)?.subject_id).toBe("f2");
    await movePage(f.db, "u1", "p1", "f2");
    expect(f.tables().pages[0].notebook_id).toBe(target);
    expect(f.tables().notebooks.filter((n) => n.subject_id === "f2")).toHaveLength(1);
    expect(f.tables().pages.filter((p) => p.id === "p1")).toHaveLength(1);
  });
  it("refuses a folder that is not the owner's", async () => {
    const f = fakeDb(base());
    await expect(movePage(f.db, "u1", "p1", "fx")).rejects.toThrow("Folder not found");
    expect(f.tables().pages[0].notebook_id).toBe("nb1");
  });
  it("refuses another owner's page", async () => {
    const f = fakeDb(base());
    await expect(movePage(f.db, "u1", "px", "f2")).rejects.toThrow();
    expect(f.tables().pages[1].notebook_id).toBe("nbx");
  });
});

describe("duplicatePage", () => {
  it("makes '<title> (copy)' in the same notebook with new element ids that match the ids inside data", async () => {
    const f = fakeDb(base());
    const copy = await duplicatePage(f.db, "u1", "p1");
    expect(copy.title).toBe("Cells (copy)");
    expect(copy.notebook_id).toBe("nb1");
    expect(copy.id).not.toBe("p1");
    const els = f.tables().canvas_elements.filter((e) => e.page_id === copy.id);
    expect(els).toHaveLength(2); // the deleted element is not copied
    for (const e of els) {
      expect(["e1", "e2", "e3"]).not.toContain(e.id);
      expect((e.data as { id: string }).id).toBe(e.id);
      expect(e.owner_id).toBe("u1");
    }
    expect(new Set(els.map((e) => e.id)).size).toBe(2);
    // original untouched, assets shared by path
    expect(f.tables().canvas_elements.filter((e) => e.page_id === "p1")).toHaveLength(3);
    expect((els.find((e) => e.type === "image")!.data as { path: string }).path).toBe("u1/p1/a.png");
    expect(els.map((e) => e.z).sort()).toEqual([1, 2]);
  });
  it("keeps each element's source updated_at so client-stamped LWW still accepts the copy's first edits", async () => {
    const f = fakeDb(base());
    const copy = await duplicatePage(f.db, "u1", "p1");
    const els = f.tables().canvas_elements.filter((e) => e.page_id === copy.id);
    expect(els.map((e) => e.updated_at).sort()).toEqual(["2020-01-01T00:00:00.000Z", "2020-02-02T00:00:00.000Z"]);
  });
  it("copies more elements than one chunk", async () => {
    const seed = base();
    seed.canvas_elements = Array.from({ length: 1250 }, (_, i) => ({ id: `s${i}`, owner_id: "u1", page_id: "p1", type: "stroke", z: i, deleted: false, data: { id: `s${i}`, type: "stroke" } }));
    const f = fakeDb(seed);
    const copy = await duplicatePage(f.db, "u1", "p1");
    expect(f.tables().canvas_elements.filter((e) => e.page_id === copy.id)).toHaveLength(1250);
  });
  it("refuses another owner's page", async () => {
    const f = fakeDb(base());
    await expect(duplicatePage(f.db, "u1", "px")).rejects.toThrow();
    expect(f.tables().pages).toHaveLength(2);
  });
  it("removes the half-made copy when copying elements fails", async () => {
    const f = fakeDb(base(), { failElementInsert: true });
    await expect(duplicatePage(f.db, "u1", "p1")).rejects.toThrow("boom");
    expect(f.tables().pages.map((p) => p.id)).toEqual(["p1", "px"]);
  });
});
