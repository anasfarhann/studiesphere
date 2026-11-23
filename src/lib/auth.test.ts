import { beforeEach, describe, expect, it, vi } from "vitest";

// Outside a React server render, cache() is a passthrough; emulate per-request memoization.
vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  cache: <T extends (...a: never[]) => unknown>(fn: T): T => {
    let hit: unknown;
    return ((...a: never[]) => (hit ??= fn(...a))) as T;
  },
}));
const getClaims = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth: { getClaims } }),
}));
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));

describe("getUser", () => {
  beforeEach(() => {
    vi.resetModules();
    getClaims.mockReset();
    redirect.mockClear();
  });

  it("shares one auth call across callers in a request", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "u1", email: "a@b.c" } } });
    const { getUser } = await import("./auth");
    const [a, b] = await Promise.all([getUser(), getUser()]);
    await getUser();
    expect(a).toEqual({ id: "u1", email: "a@b.c" });
    expect(b).toBe(a);
    expect(getClaims).toHaveBeenCalledTimes(1);
  });

  it("redirects to /login when signed out", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    const { getUser } = await import("./auth");
    await expect(getUser()).rejects.toThrow("REDIRECT:/login");
  });
});
