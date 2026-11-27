import { describe, expect, it } from "vitest";
import { authRedirect } from "./auth-routes";

describe("authRedirect", () => {
  it.each(["/", "/login", "/signup"])("sends signed-in users from %s to /app", (p) => expect(authRedirect(p, true)).toBe("/app"));
  it.each(["/forgot-password", "/reset-password", "/auth/callback", "/app"])("leaves signed-in users on %s", (p) =>
    expect(authRedirect(p, true)).toBeNull());
  it.each(["/app", "/app/p/1"])("sends signed-out users from %s to /login", (p) => expect(authRedirect(p, false)).toBe("/login"));
  it.each(["/", "/login", "/forgot-password", "/reset-password", "/application"])("lets signed-out users see %s", (p) =>
    expect(authRedirect(p, false)).toBeNull());
});
