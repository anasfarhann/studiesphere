import { describe, expect, it } from "vitest";
import { authRedirect, skipsSessionRefresh } from "./auth-routes";

describe("authRedirect", () => {
  it.each(["/", "/login", "/signup"])("sends signed-in users from %s to /app", (p) => expect(authRedirect(p, true)).toBe("/app"));
  it.each(["/forgot-password", "/reset-password", "/auth/callback", "/auth/recovery", "/auth/recovery/session", "/app"])("leaves signed-in users on %s", (p) =>
    expect(authRedirect(p, true)).toBeNull());
  it.each(["/app", "/app/p/1"])("sends signed-out users from %s to /login", (p) => expect(authRedirect(p, false)).toBe("/login"));
  it.each(["/", "/login", "/forgot-password", "/reset-password", "/auth/recovery", "/auth/recovery/session", "/application"])("lets signed-out users see %s", (p) =>
    expect(authRedirect(p, false)).toBeNull());
});

describe("skipsSessionRefresh", () => {
  // The session route writes the cookie session itself; a proxy refresh of an older session must not race it.
  it("skips the recovery session route only", () => {
    expect(skipsSessionRefresh("/auth/recovery/session")).toBe(true);
    for (const p of ["/auth/recovery", "/auth/recovery/session/x", "/reset-password", "/app"]) expect(skipsSessionRefresh(p)).toBe(false);
  });
});
