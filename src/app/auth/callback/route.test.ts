import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_COOKIE, verifyRecoveryCookie } from "@/lib/recovery-cookie";

const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth: { exchangeCodeForSession } }),
}));

import { GET } from "./route";

const call = (qs: string) => GET(new NextRequest(`http://localhost:3000/auth/callback${qs}`));

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.stubEnv("RECOVERY_COOKIE_SECRET", "s3cret");
    exchangeCodeForSession.mockReset().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  const recoveryCookie = (res: Response) =>
    (res as unknown as { cookies: { get: (n: string) => { value: string } | undefined } }).cookies.get(RECOVERY_COOKIE);

  it("sets the recovery cookie only for a successful recovery exchange", async () => {
    const ok = await call("?code=abc&next=%2Freset-password");
    expect(verifyRecoveryCookie(recoveryCookie(ok)?.value, "user-1", Date.now(), "s3cret")).toBe(true);
    expect(recoveryCookie(await call("?code=abc"))).toBeUndefined();
    exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: new Error("bad") });
    expect(recoveryCookie(await call("?code=abc&next=%2Freset-password"))).toBeUndefined();
  });

  it("exchanges the code and redirects to /app by default", async () => {
    const res = await call("?code=abc");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it("redirects to a relative next path", async () => {
    const res = await call("?code=abc&next=%2Freset-password");
    expect(res.headers.get("location")).toBe("http://localhost:3000/reset-password");
  });

  it("ignores an off-site next", async () => {
    const res = await call("?code=abc&next=%2F%2Fevil.example");
    expect(res.headers.get("location")).toBe("http://localhost:3000/app");
  });

  it("goes to /login when the exchange fails or there is no code", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: new Error("bad") });
    expect((await call("?code=abc")).headers.get("location")).toBe("http://localhost:3000/login");
    expect((await call("")).headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("sends an expired recovery link to the reset page's expired state", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: new Error("bad") });
    const res = await call("?code=abc&next=%2Freset-password");
    expect(res.headers.get("location")).toBe("http://localhost:3000/reset-password");
  });
});
