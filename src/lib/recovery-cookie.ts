import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

/**
 * Server-issued proof that this browser just followed a password-recovery link. Being signed in is not
 * enough to see /reset-password (an unlocked, signed-in browser must not allow a password change), so
 * /auth/confirm and /auth/callback set this cookie after verifying a recovery link.
 * Value: `<userId>.<expiry ms>.<HMAC-SHA256 base64url>`.
 */
export const RECOVERY_COOKIE = "ss_recovery";
export const RECOVERY_TTL_SECONDS = 15 * 60;

export const recoveryCookieOptions = {
  httpOnly: true,
  secure: true, // browsers accept Secure cookies on http://localhost too
  sameSite: "lax" as const,
  path: "/",
  maxAge: RECOVERY_TTL_SECONDS,
};

/** RECOVERY_COOKIE_SECRET, else a key derived from the service role key, else null (fail closed). */
export function recoverySecret(): string | null {
  const explicit = process.env.RECOVERY_COOKIE_SECRET;
  if (explicit) return explicit;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (service) return createHmac("sha256", service).update("studiesphere:recovery-cookie:v1").digest("base64url");
  return null;
}

const mac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function signRecoveryCookie(userId: string, now: number, secret: string): string {
  const payload = `${userId}.${now + RECOVERY_TTL_SECONDS * 1000}`;
  return `${payload}.${mac(payload, secret)}`;
}

export function verifyRecoveryCookie(
  value: string | undefined,
  userId: string,
  now: number,
  secret: string | null,
): boolean {
  if (!value || !secret) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [uid, exp, sig] = parts;
  const expected = Buffer.from(mac(`${uid}.${exp}`, secret));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return uid === userId && Number(exp) > now;
}

type Amr = { method?: string; timestamp?: number };
export type RecoveryClaims = { sub?: string; iat?: number; amr?: Amr[] | unknown } | null | undefined;

/**
 * May this request see the change-password form? Needs a session plus either a valid recovery cookie for
 * the same user, or a recovery `amr` entry (with the token issued) in the last 15 minutes.
 */
export function recoveryAllowed({
  claims,
  cookie,
  now,
  secret,
}: {
  claims: RecoveryClaims;
  cookie?: string;
  now: number;
  secret: string | null;
}): boolean {
  const sub = claims?.sub;
  if (!sub) return false;
  if (verifyRecoveryCookie(cookie, sub, now, secret)) return true;
  const amr = Array.isArray(claims?.amr) ? (claims.amr as Amr[]) : [];
  const recovery = amr.find((a) => a?.method === "recovery");
  if (!recovery) return false;
  const nowSec = now / 1000;
  const fresh = (t: number | undefined) => typeof t === "number" && nowSec - t <= RECOVERY_TTL_SECONDS && t <= nowSec + 60;
  return fresh(recovery.timestamp) && fresh(claims?.iat);
}

/** Adds the recovery cookie to a response. Returns false (and sets nothing) when no secret is configured. */
export function setRecoveryCookie(response: NextResponse, userId: string, now = Date.now()): boolean {
  const secret = recoverySecret();
  if (!secret) return false;
  response.cookies.set(RECOVERY_COOKIE, signRecoveryCookie(userId, now, secret), recoveryCookieOptions);
  return true;
}
