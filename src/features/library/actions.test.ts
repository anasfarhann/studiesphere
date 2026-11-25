import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ ensure: vi.fn(), createPage: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: m.redirect, unstable_rethrow: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({ getUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));
vi.mock("./supabase-repo", () => ({ SupabaseLibraryRepo: class { createPage = m.createPage; } }));
vi.mock("./quick-notes", async (orig) => ({ ...(await orig<typeof import("./quick-notes")>()), ensureQuickNotebook: m.ensure }));

import { createQuickPageAction } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  m.ensure.mockResolvedValue("nb1");
  m.createPage.mockResolvedValue({ id: "p9" });
  vi.useRealTimers();
});

describe("createQuickPageAction", () => {
  it("creates a page in the quick notebook titled with the user's local date, then redirects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T20:00:00Z"));
    const f = new FormData();
    f.set("tz", "Asia/Kuala_Lumpur");
    await createQuickPageAction(f);
    expect(m.createPage).toHaveBeenCalledWith("nb1", "Page · 25 Nov");
    expect(m.redirect).toHaveBeenCalledWith("/app/p/p9");
  });
  it("falls back to UTC for a bad zone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T20:00:00Z"));
    const f = new FormData();
    f.set("tz", "bogus");
    await createQuickPageAction(f);
    expect(m.createPage).toHaveBeenCalledWith("nb1", "Page · 24 Nov");
  });
});
