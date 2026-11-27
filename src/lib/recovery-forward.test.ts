import { describe, expect, it } from "vitest";
import { recoveryForwardTarget, siteOrigin } from "./recovery-forward";

describe("recoveryForwardTarget", () => {
  const tokens = "#access_token=a&refresh_token=r&expires_in=3600&type=recovery";

  it("forwards a recovery fragment that landed on the home page, keeping it", () => {
    expect(recoveryForwardTarget("/", tokens)).toBe(`/auth/recovery${tokens}`);
  });
  it("forwards from /app (signed-in redirect keeps the fragment)", () => {
    expect(recoveryForwardTarget("/app", tokens)).toBe(`/auth/recovery${tokens}`);
  });
  it("forwards an expired-link error so the user sees the expired state", () => {
    const err = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid";
    expect(recoveryForwardTarget("/", err)).toBe(`/auth/recovery${err}`);
  });
  it("does nothing on the landing page itself", () => {
    expect(recoveryForwardTarget("/auth/recovery", tokens)).toBeNull();
  });
  it("ignores ordinary fragments and non-recovery tokens", () => {
    expect(recoveryForwardTarget("/", "")).toBeNull();
    expect(recoveryForwardTarget("/", "#")).toBeNull();
    expect(recoveryForwardTarget("/app", "#section-2")).toBeNull();
    expect(recoveryForwardTarget("/", "#access_token=a&type=signup")).toBeNull();
    expect(recoveryForwardTarget("/", "#type=recovery")).toBeNull();
  });
});

describe("siteOrigin", () => {
  it("uses the configured https origin", () => {
    expect(siteOrigin("https://x.vercel.app", "https://studiesphere.vercel.app/")).toBe("https://studiesphere.vercel.app");
  });
  it("falls back when unset, blank, invalid or not https", () => {
    expect(siteOrigin("https://x.vercel.app", undefined)).toBe("https://x.vercel.app");
    expect(siteOrigin("https://x.vercel.app", "  ")).toBe("https://x.vercel.app");
    expect(siteOrigin("https://x.vercel.app", "not a url")).toBe("https://x.vercel.app");
    expect(siteOrigin("https://x.vercel.app", "http://evil.example")).toBe("https://x.vercel.app");
  });
  it("allows http on localhost for development", () => {
    expect(siteOrigin("http://127.0.0.1:3000", "http://localhost:3000")).toBe("http://localhost:3000");
  });
});
