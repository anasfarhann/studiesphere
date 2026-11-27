/** Path of the page that turns a recovery fragment into a password-reset session. */
export const RECOVERY_LANDING = "/auth/recovery";

/**
 * Where to send a page whose URL fragment came from a Supabase recovery link, or null to stay.
 *
 * Supabase falls back to the Site URL root when an email's redirect_to is not on its allowlist (for
 * example a link requested from another domain of the same deployment). The token fragment then lands
 * on "/" (or, through the signed-in redirect, on /app), where nothing reads it. Forwarding keeps the
 * fragment, so /auth/recovery can finish the reset as usual.
 */
export function recoveryForwardTarget(pathname: string, hash: string): string | null {
  if (pathname === RECOVERY_LANDING || !hash || hash === "#") return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const isRecovery = params.get("type") === "recovery" && params.has("access_token");
  const isLinkError = params.has("error_code") || params.has("error");
  return isRecovery || isLinkError ? RECOVERY_LANDING + (hash.startsWith("#") ? hash : `#${hash}`) : null;
}

/** Canonical origin for links in emails: NEXT_PUBLIC_SITE_URL when set, else the current origin. */
export function siteOrigin(fallback: string, configured = process.env.NEXT_PUBLIC_SITE_URL): string {
  const value = configured?.trim();
  if (!value) return fallback;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost" ? url.origin : fallback;
  } catch {
    return fallback;
  }
}
