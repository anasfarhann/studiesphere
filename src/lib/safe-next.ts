/**
 * Sanitises a post-auth `next` redirect target. Only same-origin relative paths ("/…") are allowed;
 * protocol-relative ("//host"), backslash tricks, encoded slashes and control characters fall back to /app.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.includes("\\")) return fallback;
  // Final check: resolving against a dummy origin must not change the origin.
  const url = new URL(next, "http://localhost");
  return url.origin === "http://localhost" ? next : fallback;
}
