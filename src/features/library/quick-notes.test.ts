import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";
import { ensureQuickNotebook, quickPageTitle } from "./quick-notes";

type Row = Record<string, string | number>;

const T0 = Date.parse("2026-11-25T12:00:00Z");
const iso = (msAgo: number) => new Date(T0 - msAgo).toISOString();
const NOW = new Date(T0);
const MIN = 60_000;

/** Minimal in-memory stand-in for the supabase query builder shapes ensureQuickNotebook uses. */
function fakeDb(afterList?: (table: string, calls: number, tables: Record<string, Row[]>) => void) {
  const tables: Record<string, Row[]> = { subjects: [], notebooks: [], pages: [] };
  const listCalls: Record<string, number> = {};
  let n = 0;
  const db = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      let inF: [string, string[]] | undefined;
      const orders: [string, boolean][] = [];
      let max: number | undefined;
      let listed = false;
      const rows = () => {
        let r = tables[table].filter((x) => filters.every(([k, v]) => x[k] === v) && (!inF || inF[1].includes(x[inF[0]] as string)));
        for (const [k, asc] of [...orders].reverse()) r = [...r].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1));
        return max ? r.slice(0, max) : r;
      };
      const q = {
        select: () => ((listed = true), q),
        eq: (k: string, v: unknown) => (filters.push([k, v]), q),
        in: (k: string, v: string[]) => ((inF = [k, v]), q),
        order: (k: string, o?: { ascending: boolean }) => (orders.push([k, o?.ascending !== false]), q),
        limit: (m: number) => ((max = m), q),
        then: (res: (v: unknown) => unknown) => {
          const data = rows();
          if (listed && orders.length) {
            listCalls[table] = (listCalls[table] ?? 0) + 1;
            afterList?.(table, listCalls[table], tables);
          }
          return res({ data, error: null });
        },
        insert: (row: Row) => {
          n++;
          tables[table].push({ owner_id: "u1", ...row, id: `${table}-${n}`, created_at: iso(0) });
          return { then: (res: (v: unknown) => unknown) => res({ error: null }) };
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
  return { db: db as unknown as SupabaseClient<Database>, tables: () => tables };
}

const subj = (id: string, ago: number, owner = "u1"): Row => ({ id, owner_id: owner, name: "Quick notes", color: "#DCD6FA", created_at: iso(ago) });
const nb = (id: string, subject_id: string, ago: number): Row => ({ id, owner_id: "u1", subject_id, title: "Pages", created_at: iso(ago) });

describe("ensureQuickNotebook", () => {
  it("creates Quick notes (lavender) and Pages when missing", async () => {
    const { db, tables } = fakeDb();
    const id = await ensureQuickNotebook(db, "u1", NOW);
    const t = tables();
    expect(t.subjects).toHaveLength(1);
    expect(t.subjects[0]).toMatchObject({ name: "Quick notes", color: "#DCD6FA" });
    expect(t.notebooks[0]).toMatchObject({ title: "Pages", subject_id: t.subjects[0].id, id });
  });

  it("reuses existing subject and notebook", async () => {
    const { db, tables } = fakeDb();
    const a = await ensureQuickNotebook(db, "u1", NOW);
    expect(await ensureQuickNotebook(db, "u1", NOW)).toBe(a);
    expect(tables().subjects).toHaveLength(1);
    expect(tables().notebooks).toHaveLength(1);
  });

  it("does not reuse another owner's subject", async () => {
    const { db, tables } = fakeDb();
    tables().subjects.push(subj("x", 0, "other"));
    await ensureQuickNotebook(db, "u1", NOW);
    expect(tables().subjects).toHaveLength(2);
  });

  it("(a) a row appearing after our re-select never deletes ours, and the next call converges on the same winner", async () => {
    const { db, tables } = fakeDb((table, calls, t) => {
      // After our post-insert re-select, the other tab's older subject shows up.
      if (table === "subjects" && calls === 2) t.subjects.unshift(subj("other-s", 5_000));
    });
    const first = await ensureQuickNotebook(db, "u1", NOW);
    expect(tables().subjects.map((s) => s.id)).toContain("subjects-1"); // ours was not deleted
    const second = await ensureQuickNotebook(db, "u1", NOW);
    const third = await ensureQuickNotebook(db, "u1", NOW);
    expect(second).toBe(third);
    expect(tables().notebooks.find((n) => n.id === second)!.subject_id).toBe("other-s");
    expect(first).toBeTruthy();
  });

  it("(b) a duplicate that has a notebook is never deleted, nor one whose notebook has pages", async () => {
    const { db, tables } = fakeDb();
    const t = tables();
    t.subjects.push(subj("s1", 10 * MIN), subj("s2", 9 * MIN), subj("s3", 8 * MIN));
    t.notebooks.push(nb("n1", "s1", 10 * MIN), nb("n1b", "s1", 9 * MIN), nb("n2", "s2", 9 * MIN));
    t.pages.push({ id: "p1", notebook_id: "n1b" });
    expect(await ensureQuickNotebook(db, "u1", NOW)).toBe("n1");
    expect(tables().subjects.map((s) => s.id)).toEqual(["s1", "s2"]); // s3 empty+old gone, s2 has a notebook
    expect(tables().notebooks.map((n) => n.id)).toEqual(["n1", "n1b", "n2"]); // n1b has a page
  });

  it("(c) an empty duplicate older than 2 minutes is cleaned up", async () => {
    const { db, tables } = fakeDb();
    tables().subjects.push(subj("s1", 10 * MIN), subj("s2", 3 * MIN));
    tables().notebooks.push(nb("n1", "s1", 10 * MIN), nb("n1dup", "s1", 3 * MIN));
    await ensureQuickNotebook(db, "u1", NOW);
    expect(tables().subjects.map((s) => s.id)).toEqual(["s1"]);
    expect(tables().notebooks.map((n) => n.id)).toEqual(["n1"]);
  });

  it("(d) an empty duplicate younger than 2 minutes is left alone", async () => {
    const { db, tables } = fakeDb();
    tables().subjects.push(subj("s1", 10 * MIN), subj("s2", 1 * MIN));
    tables().notebooks.push(nb("n1", "s1", 10 * MIN), nb("n1dup", "s1", 1 * MIN));
    await ensureQuickNotebook(db, "u1", NOW);
    expect(tables().subjects.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(tables().notebooks.map((n) => n.id)).toEqual(["n1", "n1dup"]);
  });
});

describe("quickPageTitle", () => {
  it("formats 'Page · 25 Nov' in UTC by default", () => {
    expect(quickPageTitle(new Date("2026-11-25T12:00:00Z"))).toBe("Page · 25 Nov");
  });
  it("uses the user's zone: 20:00Z on the 24th is the 25th in Kuala Lumpur", () => {
    const at = new Date("2026-11-24T20:00:00Z");
    expect(quickPageTitle(at, "Asia/Kuala_Lumpur")).toBe("Page · 25 Nov");
    expect(quickPageTitle(at, "UTC")).toBe("Page · 24 Nov");
  });
  it("falls back to UTC for invalid, missing or oversized zones", () => {
    const at = new Date("2026-11-24T20:00:00Z");
    for (const tz of ["Not/AZone", "", null, undefined, 5, "x".repeat(65)]) expect(quickPageTitle(at, tz)).toBe("Page · 24 Nov");
  });
});
