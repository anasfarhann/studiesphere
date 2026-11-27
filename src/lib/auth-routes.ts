const SIGNED_OUT_ONLY = new Set(["/", "/login", "/signup"]);

/**
 * Where the proxy sends a request, or null to let it through. Signed-in users skip the sign-in screens;
 * /forgot-password, /reset-password and /auth/* (recovery landing, its session route, callbacks) stay
 * reachable either way (the recovery link signs the user in first).
 */
export function authRedirect(path: string, signedIn: boolean): string | null {
  if (signedIn && SIGNED_OUT_ONLY.has(path)) return "/app";
  if (!signedIn && (path === "/app" || path.startsWith("/app/"))) return "/login";
  return null;
}

/**
 * Paths where the proxy must not touch the Supabase session: /auth/recovery/session sets the session
 * cookies itself, and a refreshed older session written by the proxy could race with them.
 */
export function skipsSessionRefresh(path: string): boolean {
  return path === "/auth/recovery/session";
}
