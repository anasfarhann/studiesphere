import { describe, expect, it, vi } from "vitest";

type Rows = Record<string, Record<string, unknown>[]>;
const m = vi.hoisted(() => ({ rows: {} as Rows }));
vi.mock("@/lib/auth", () => ({ getUser: async () => ({ id: "u1" }) }));
/** Minimal PostgREST stand-in: select / eq / in / order (desc) / limit over in-memory rows. */
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({
    from(table: string) {
      let rows = [...(m.rows[table] ?? [])];
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), q),
        in: (k: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[k]))), q),
        order: (k: string) => ((rows = rows.sort((a, b) => String(b[k]).localeCompare(String(a[k])))), q),
        limit: (n: number) => ((rows = rows.slice(0, n)), q),
        then: (ok: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok),
      };
      return q;
    },
  }),
}));

import { getRecentPages, mergeRecent, pickRecent, resolveDisplayName } from "./queries";

describe("mergeRecent", () => {
  const page = (id: string, updated_at: string) => ({ id, title: id, notebook_id: "nb", updated_at });
  it("uses the later of the element edit and pages.updated_at, dedupes and sorts newest first", () => {
    const out = mergeRecent(
      [{ pageId: "a", editedAt: "2026-11-23T10:00:00Z" }, { pageId: "b", editedAt: "2026-11-20T10:00:00Z" }],
      [page("a", "2026-11-01T00:00:00Z"), page("b", "2026-11-22T00:00:00Z"), page("blank", "2026-11-24T00:00:00Z"), page("a", "2026-11-01T00:00:00Z")],
      3,
    );
    expect(out.map((p) => [p.id, p.editedAt])).toEqual([
      ["blank", "2026-11-24T00:00:00Z"],
      ["a", "2026-11-23T10:00:00Z"],
      ["b", "2026-11-22T00:00:00Z"],
    ]);
    expect(mergeRecent([], [page("x", "2026-11-01T00:00:00Z"), page("y", "2026-11-02T00:00:00Z")], 1).map((p) => p.id)).toEqual(["y"]);
  });
});

describe("getRecentPages", () => {
  it("an active user with 3+ edited pages sees a just-created blank page first", async () => {
    m.rows = {
      canvas_elements: [
        { page_id: "p1", updated_at: "2026-11-25T09:00:00.000+00:00" },
        { page_id: "p2", updated_at: "2026-11-25T08:00:00.000+00:00" },
        { page_id: "p3", updated_at: "2026-11-25T07:00:00.000+00:00" },
        { page_id: "p4", updated_at: "2026-11-25T06:00:00.000+00:00" },
      ],
      pages: [
        { id: "p1", owner_id: "u1", title: "One", notebook_id: "nb", updated_at: "2026-11-01T00:00:00.000+00:00" },
        { id: "p2", owner_id: "u1", title: "Two", notebook_id: "nb", updated_at: "2026-11-01T00:00:00.000+00:00" },
        { id: "p3", owner_id: "u1", title: "Three", notebook_id: "nb", updated_at: "2026-11-01T00:00:00.000+00:00" },
        { id: "p4", owner_id: "u1", title: "Four", notebook_id: "nb", updated_at: "2026-11-01T00:00:00.000+00:00" },
        { id: "blank", owner_id: "u1", title: "Page · 25 Nov", notebook_id: "nb", updated_at: "2026-11-25T10:00:00.000+00:00" },
        { id: "other", owner_id: "u2", title: "Not mine", notebook_id: "nb", updated_at: "2026-11-25T11:00:00.000+00:00" },
      ],
      notebooks: [{ id: "nb", title: "Quick notes", subject_id: "s" }],
      subjects: [{ id: "s", name: "Quick notes", color: "#F4D35E" }],
    };
    const recent = await getRecentPages(3);
    expect(recent.map((p) => p.id)).toEqual(["blank", "p1", "p2"]);
    expect(recent[0]).toMatchObject({ title: "Page · 25 Nov", notebookTitle: "Quick notes", editedAt: "2026-11-25T10:00:00.000+00:00" });
  });
});

describe("pickRecent", () => {
  it("takes the first distinct page ids in order with their newest time", () => {
    const rows = [
      { page_id: "a", updated_at: "2026-11-23T10:00:00Z" },
      { page_id: "a", updated_at: "2026-11-23T09:00:00Z" },
      { page_id: "b", updated_at: "2026-11-22T10:00:00Z" },
      { page_id: "c", updated_at: "2026-11-21T10:00:00Z" },
      { page_id: "d", updated_at: "2026-11-20T10:00:00Z" },
    ];
    expect(pickRecent(rows, 3)).toEqual([
      { pageId: "a", editedAt: "2026-11-23T10:00:00Z" },
      { pageId: "b", editedAt: "2026-11-22T10:00:00Z" },
      { pageId: "c", editedAt: "2026-11-21T10:00:00Z" },
    ]);
  });
  it("returns [] for no rows", () => expect(pickRecent([], 3)).toEqual([]));
});

describe("resolveDisplayName", () => {
  it("prefers the profile name, then the email local part, never empty", () => {
    expect(resolveDisplayName(" Anas ", "a@b.co")).toBe("Anas");
    expect(resolveDisplayName(null, "sam@b.co")).toBe("sam");
    expect(resolveDisplayName("  ", "")).toBe("there");
    expect(resolveDisplayName(undefined, undefined)).toBe("there");
    expect(resolveDisplayName(null, "@b.co")).toBe("there");
  });
});
