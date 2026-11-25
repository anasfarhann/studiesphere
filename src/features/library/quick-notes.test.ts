import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import { ensureQuickNotebook, quickPageTitle } from "./quick-notes";

type Row = Record<string, string | number>;

/** Minimal in-memory stand-in for the supabase query builder shapes ensureQuickNotebook uses. */
function fakeDb(onInsert?: (table: string, tables: Record<string, Row[]>) => void) {
  const tables: Record<string, Row[]> = { subjects: [], notebooks: [] };
  let n = 0;
  const db = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const orders: string[] = [];
      let desc = false;
      let max: number | undefined;
      const rows = () => {
        let r = tables[table].filter((x) => filters.every(([k, v]) => x[k] === v));
        for (const k of [...orders].reverse()) r = [...r].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0));
        if (desc) r.reverse();
        return max ? r.slice(0, max) : r;
      };
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push([k, v]), q),
        order: (k: string, o?: { ascending: boolean }) => (orders.push(k), (desc = o?.ascending === false), q),
        limit: (m: number) => ((max = m), q),
        then: (res: (v: unknown) => unknown) => res({ data: rows(), error: null }),
        insert: (row: Row) => {
          const full = { owner_id: "u1", ...row, id: `${table}-${++n}`, created_at: String(1000 + n) };
          tables[table].push(full);
          onInsert?.(table, tables);
          return { select: () => ({ single: async () => ({ data: full, error: null }) }) };
        },
        delete: () => ({
          eq: async (k: string, v: unknown) => {
            tables[table] = tables[table].filter((x) => x[k] !== v);
            return { error: null };
          },
        }),
      };
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient<Database>, tables };
}

describe("ensureQuickNotebook", () => {
  it("creates Quick notes (lavender) and Pages when missing", async () => {
    const { db, tables } = fakeDb();
    const id = await ensureQuickNotebook(db, "u1");
    expect(tables.subjects).toHaveLength(1);
    expect(tables.subjects[0]).toMatchObject({ name: "Quick notes", color: "#DCD6FA" });
    expect(tables.notebooks).toHaveLength(1);
    expect(tables.notebooks[0]).toMatchObject({ title: "Pages", subject_id: tables.subjects[0].id, id });
  });

  it("reuses existing subject and notebook", async () => {
    const { db, tables } = fakeDb();
    const a = await ensureQuickNotebook(db, "u1");
    const b = await ensureQuickNotebook(db, "u1");
    expect(b).toBe(a);
    expect(tables.subjects).toHaveLength(1);
    expect(tables.notebooks).toHaveLength(1);
  });

  it("does not reuse another owner's subject", async () => {
    const { db, tables } = fakeDb();
    tables.subjects.push({ id: "x", owner_id: "other", name: "Quick notes", color: "#DCD6FA", created_at: "1" });
    await ensureQuickNotebook(db, "u1");
    expect(tables.subjects).toHaveLength(2);
  });

  it("dedupes a subject race: keeps the older subject, deletes ours", async () => {
    const { db, tables } = fakeDb((table, t) => {
      if (table === "subjects" && t.subjects.length === 1)
        t.subjects.unshift({ id: "other-s", owner_id: "u1", name: "Quick notes", color: "#DCD6FA", created_at: "1" });
    });
    const id = await ensureQuickNotebook(db, "u1");
    expect(tables.subjects.map((s) => s.id)).toEqual(["other-s"]);
    expect(tables.notebooks).toHaveLength(1);
    expect(tables.notebooks[0]).toMatchObject({ id, subject_id: "other-s" });
  });

  it("dedupes a notebook race: keeps the older notebook, deletes ours", async () => {
    const { db, tables } = fakeDb((table, t) => {
      if (table === "notebooks" && t.notebooks.length === 1)
        t.notebooks.unshift({ id: "other-n", owner_id: "u1", subject_id: t.subjects[0].id, title: "Pages", created_at: "1" });
    });
    const id = await ensureQuickNotebook(db, "u1");
    expect(id).toBe("other-n");
    expect(tables.notebooks.map((n) => n.id)).toEqual(["other-n"]);
  });
});

describe("quickPageTitle", () => {
  it("formats 'Page · 25 Nov'", () => {
    expect(quickPageTitle(new Date(2026, 10, 25, 12))).toBe("Page · 25 Nov");
  });
});
