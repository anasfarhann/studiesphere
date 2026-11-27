import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVERY_COOKIE, verifyRecoveryCookie } from "@/lib/recovery-cookie";

const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth: { verifyOtp } }),
}));

import { GET } from "./route";

const call = (qs: string) => GET(new NextRequest(`http://localhost:3000/auth/confirm${qs}`));
const loc = (res: Response) => res.headers.get("location");
const recoveryCookie = (res: Response) =>
  (res as unknown as { cookies: { get: (n: string) => { value: string } | undefined } }).cookies.get(RECOVERY_COOKIE);

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    vi.stubEnv("RECOVERY_COOKIE_SECRET", "s3cret");
    verifyOtp.mockReset().mockResolvedValue({ data: { user: { id: "user-1" }, session: {} }, error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("verifies a recovery token, sets the recovery cookie and goes to /reset-password", async () => {
    const res = await call("?token_hash=th&type=recovery&next=/reset-password");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "th" });
    expect(loc(res)).toBe("http://localhost:3000/reset-password");
    const c = recoveryCookie(res);
    expect(c).toBeDefined();
    expect(verifyRecoveryCookie(c!.value, "user-1", Date.now(), "s3cret")).toBe(true);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(res.headers.get("set-cookie")).toMatch(/Secure/i);
    expect(res.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
  });

  it("defaults recovery to /reset-password without next", async () => {
    expect(loc(await call("?token_hash=th&type=recovery"))).toBe("http://localhost:3000/reset-password");
  });

  it("ignores an unsafe next", async () => {
    const res = await call("?token_hash=th&type=recovery&next=%2F%2Fevil.example");
    expect(loc(res)).toBe("http://localhost:3000/reset-password");
  });

  it("sends a bad or used token to the expired state without a cookie", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: { code: "otp_expired" } });
    const res = await call("?token_hash=bad&type=recovery&next=/reset-password");
    expect(loc(res)).toBe("http://localhost:3000/reset-password");
    expect(recoveryCookie(res)).toBeUndefined();
  });

  it("refuses unknown types without calling Supabase", async () => {
    for (const type of ["magiclink", "invite", "email_change", "", "phone_change"]) {
      const res = await call(`?token_hash=th&type=${type}&next=/app`);
      expect(loc(res)).toBe("http://localhost:3000/login");
      expect(recoveryCookie(res)).toBeUndefined();
    }
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses a missing token", async () => {
    const res = await call("?type=recovery");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(loc(res)).toBe("http://localhost:3000/reset-password");
  });

  it("confirms sign-up emails and goes to /app without a recovery cookie", async () => {
    for (const type of ["email", "signup"]) {
      const res = await call(`?token_hash=th&type=${type}&next=/reset-password`);
      expect(loc(res)).toBe("http://localhost:3000/app");
      expect(recoveryCookie(res)).toBeUndefined();
    }
  });

  it("sends a failed sign-up confirmation to /login", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { code: "otp_expired" } });
    expect(loc(await call("?token_hash=th&type=signup"))).toBe("http://localhost:3000/login");
  });

  it("fails closed without a cookie secret", async () => {
    vi.stubEnv("RECOVERY_COOKIE_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const res = await call("?token_hash=th&type=recovery");
    expect(loc(res)).toBe("http://localhost:3000/reset-password");
    expect(recoveryCookie(res)).toBeUndefined();
  });
});
