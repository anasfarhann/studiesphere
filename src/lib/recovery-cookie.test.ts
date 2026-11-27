import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RECOVERY_COOKIE,
  RECOVERY_TTL_SECONDS,
  recoveryAllowed,
  recoveryCookieOptions,
  recoverySecret,
  signRecoveryCookie,
  verifyRecoveryCookie,
} from "./recovery-cookie";

const NOW = 1_800_000_000_000;
const SECRET = "test-secret";

afterEach(() => vi.unstubAllEnvs());

describe("recovery cookie", () => {
  it("round-trips for the same user within 15 minutes", () => {
    const v = signRecoveryCookie("user-1", NOW, SECRET);
    expect(verifyRecoveryCookie(v, "user-1", NOW + 14 * 60_000, SECRET)).toBe(true);
  });
  it("expires after 15 minutes", () => {
    const v = signRecoveryCookie("user-1", NOW, SECRET);
    expect(verifyRecoveryCookie(v, "user-1", NOW + RECOVERY_TTL_SECONDS * 1000 + 1, SECRET)).toBe(false);
  });
  it("rejects another user", () => {
    const v = signRecoveryCookie("user-1", NOW, SECRET);
    expect(verifyRecoveryCookie(v, "user-2", NOW, SECRET)).toBe(false);
  });
  it("rejects tampering", () => {
    const v = signRecoveryCookie("user-1", NOW, SECRET);
    const [uid, exp, mac] = v.split(".");
    expect(verifyRecoveryCookie(`${uid}.${Number(exp) + 9999}.${mac}`, "user-1", NOW, SECRET)).toBe(false);
    expect(verifyRecoveryCookie(`user-2.${exp}.${mac}`, "user-2", NOW, SECRET)).toBe(false);
    expect(verifyRecoveryCookie(`${v}x`, "user-1", NOW, SECRET)).toBe(false);
    expect(verifyRecoveryCookie(v, "user-1", NOW, "other-secret")).toBe(false);
  });
  it("rejects missing or malformed values and a missing secret", () => {
    expect(verifyRecoveryCookie(undefined, "user-1", NOW, SECRET)).toBe(false);
    expect(verifyRecoveryCookie("", "user-1", NOW, SECRET)).toBe(false);
    expect(verifyRecoveryCookie("a.b", "user-1", NOW, SECRET)).toBe(false);
    expect(verifyRecoveryCookie(signRecoveryCookie("user-1", NOW, SECRET), "user-1", NOW, null)).toBe(false);
  });
  it("is httpOnly, Secure, SameSite=Lax and lives 15 minutes", () => {
    expect(RECOVERY_COOKIE).toBe("ss_recovery");
    expect(recoveryCookieOptions).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 900 });
  });
});

describe("recoverySecret", () => {
  it("prefers RECOVERY_COOKIE_SECRET", () => {
    vi.stubEnv("RECOVERY_COOKIE_SECRET", "explicit");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    expect(recoverySecret()).toBe("explicit");
  });
  it("derives one from the service role key, never equal to the key itself", () => {
    vi.stubEnv("RECOVERY_COOKIE_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    const s = recoverySecret();
    expect(s).toBeTruthy();
    expect(s).not.toBe("service");
  });
  it("fails closed with neither", () => {
    vi.stubEnv("RECOVERY_COOKIE_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(recoverySecret()).toBeNull();
  });
});

describe("recoveryAllowed", () => {
  const nowSec = NOW / 1000;
  const cookie = signRecoveryCookie("user-1", NOW, SECRET);
  it("needs a session", () => expect(recoveryAllowed({ claims: null, cookie, now: NOW, secret: SECRET })).toBe(false));
  it("accepts a valid cookie for the session user", () =>
    expect(recoveryAllowed({ claims: { sub: "user-1" }, cookie, now: NOW, secret: SECRET })).toBe(true));
  it("refuses a plain signed-in session", () =>
    expect(recoveryAllowed({ claims: { sub: "user-1", amr: [{ method: "password", timestamp: nowSec }] }, now: NOW, secret: SECRET })).toBe(false));
  it("refuses a cookie for another user", () =>
    expect(recoveryAllowed({ claims: { sub: "user-2" }, cookie, now: NOW, secret: SECRET })).toBe(false));
  it("also accepts a fresh recovery amr", () => {
    const claims = { sub: "user-1", iat: nowSec - 60, amr: [{ method: "recovery", timestamp: nowSec - 60 }] };
    expect(recoveryAllowed({ claims, now: NOW, secret: SECRET })).toBe(true);
  });
  it("refuses a stale recovery amr", () => {
    const old = nowSec - 16 * 60;
    expect(recoveryAllowed({ claims: { sub: "user-1", iat: old, amr: [{ method: "recovery", timestamp: old }] }, now: NOW, secret: SECRET })).toBe(false);
    // A refreshed token (new iat) does not make an old recovery fresh again.
    expect(recoveryAllowed({ claims: { sub: "user-1", iat: nowSec, amr: [{ method: "recovery", timestamp: old }] }, now: NOW, secret: SECRET })).toBe(false);
  });
});
