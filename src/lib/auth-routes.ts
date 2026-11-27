const SIGNED_OUT_ONLY = new Set(["/", "/login", "/signup"]);

/**
 * Where the proxy sends a request, or null to let it through. Signed-in users skip the sign-in screens;
 * /forgot-password and /reset-password stay reachable (the recovery link signs the user in first).
 */
export function authRedirect(path: string, signedIn: boolean): string | null {
  if (signedIn && SIGNED_OUT_ONLY.has(path)) return "/app";
  if (!signedIn && (path === "/app" || path.startsWith("/app/"))) return "/login";
  return null;
}
