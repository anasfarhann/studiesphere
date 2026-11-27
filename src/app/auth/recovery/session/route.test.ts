import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_COOKIE, verifyRecoveryCookie } from "@/lib/recovery-cookie";

type CookieOpts = { getAll: () => { name: string; value: string }[]; setAll: (c: { name: string; value: string; options: object }[]) => void };
const state: { cookies?: CookieOpts; claims: Record<string, unknown> | null; userId: string | null } = {
  claims: null,
  userId: "user-1",
};
const setSession = vi.fn();
const getClaims = vi.fn();
const signOut = vi.fn();

// The route builds its own SSR client from the request cookies; the fake writes cookies like the real one.
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: CookieOpts }) => {
    state.cookies = opts.cookies;
    return { auth: { setSession, getClaims, signOut } };
  },
}));

import { POST } from "./route";

const ORIGIN = "http://localhost:3000";
const URL_ = `${ORIGIN}/auth/recovery/session`;
const tokens = { access_token: "at", refresh_token: "rt" };

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const cookie = (res: Response, name: string) =>
  (res as unknown as { cookies: { get: (n: string) => { value: string } | undefined } }).cookies.get(name);
const nowSec = () => Math.floor(Date.now() / 1000);

describe("POST /auth/recovery/session", () => {
  beforeEach(() => {
    vi.stubEnv("RECOVERY_COOKIE_SECRET", "s3cret");
    state.claims = { sub: "user-1", iat: nowSec(), amr: [{ method: "recovery", timestamp: nowSec() }] };
    state.userId = "user-1";
    setSession.mockReset().mockImplementation(async () => {
      state.cookies!.setAll([{ name: "sb-test-auth-token", value: "session", options: { path: "/" } }]);
      return state.userId
        ? { data: { user: { id: state.userId }, session: { access_token: "at2" } }, error: null }
        : { data: { user: null, session: null }, error: new Error("bad") };
    });
    getClaims.mockReset().mockImplementation(async () => ({ data: state.claims ? { claims: state.claims } : null, error: null }));
    signOut.mockReset().mockImplementation(async () => {
      state.cookies!.setAll([{ name: "sb-test-auth-token", value: "", options: { path: "/", maxAge: 0 } }]);
      return { error: null };
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects a cross-origin request without touching Supabase", async () => {
    const res = await POST(req(tokens, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(setSession).not.toHaveBeenCalled();
    const noOrigin = new NextRequest(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tokens) });
    expect((await POST(noOrigin)).status).toBe(403);
  });

  it("rejects non-JSON bodies and missing tokens", async () => {
    expect((await POST(req(tokens, { "content-type": "text/plain" }))).status).toBe(400);
    expect((await POST(req("not json"))).status).toBe(400);
    expect((await POST(req({ access_token: "at" }))).status).toBe(400);
    expect((await POST(req({ access_token: "", refresh_token: "rt" }))).status).toBe(400);
    expect((await POST(req({ access_token: 1, refresh_token: "rt" }))).status).toBe(400);
    expect(setSession).not.toHaveBeenCalled();
  });

  it("sets the session and recovery cookies for a fresh recovery token", async () => {
    const res = await POST(req(tokens));
    expect(res.status).toBe(204);
    expect(setSession).toHaveBeenCalledWith(tokens);
    expect(getClaims).toHaveBeenCalledWith("at2");
    expect(cookie(res, "sb-test-auth-token")?.value).toBe("session");
    expect(verifyRecoveryCookie(cookie(res, RECOVERY_COOKIE)?.value, "user-1", Date.now(), "s3cret")).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs a non-recovery session out and refuses it", async () => {
    state.claims = { sub: "user-1", iat: nowSec(), amr: [{ method: "password", timestamp: nowSec() }] };
    const res = await POST(req(tokens));
    expect(res.status).toBe(403);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(cookie(res, RECOVERY_COOKIE)).toBeUndefined();
    expect(cookie(res, "sb-test-auth-token")?.value).toBe("");
  });

  it("refuses a stale recovery token", async () => {
    const old = nowSec() - 16 * 60;
    state.claims = { sub: "user-1", iat: nowSec(), amr: [{ method: "recovery", timestamp: old }] };
    const res = await POST(req(tokens));
    expect(res.status).toBe(403);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(cookie(res, RECOVERY_COOKIE)).toBeUndefined();
  });

  it("refuses claims for a different user than the session", async () => {
    state.claims = { ...state.claims, sub: "user-2" };
    const res = await POST(req(tokens));
    expect(res.status).toBe(403);
    expect(cookie(res, RECOVERY_COOKIE)).toBeUndefined();
  });

  it("refuses tokens Supabase rejects", async () => {
    state.userId = null;
    const res = await POST(req(tokens));
    expect(res.status).toBe(403);
    expect(cookie(res, RECOVERY_COOKIE)).toBeUndefined();
  });

  it("fails closed without a recovery secret", async () => {
    vi.stubEnv("RECOVERY_COOKIE_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const res = await POST(req(tokens));
    expect(res.status).toBe(403);
    expect(signOut).toHaveBeenCalled();
    expect(cookie(res, RECOVERY_COOKIE)).toBeUndefined();
  });
});
