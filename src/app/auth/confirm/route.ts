import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { setRecoveryCookie } from "@/lib/recovery-cookie";
import { safeNextPath } from "@/lib/safe-next";
import { createServerClient } from "@/lib/supabase/server";

const CONFIRM_TYPES: EmailOtpType[] = ["email", "signup"];

/**
 * Token-hash email links, which work on any device (unlike PKCE /auth/callback, whose code verifier
 * lives only in the requesting browser). The Supabase "Reset Password" template must link here:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 * (see docs/supabase-email-templates.md).
 *
 * - type=recovery: verify, set the recovery cookie, go to `next` (relative only, default /reset-password).
 *   Any failure lands on /reset-password, which shows the expired state.
 * - type=email | signup: verify the sign-up confirmation and go to /app (failure: /login).
 * - Anything else is refused without calling Supabase.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const to = (path: string) => NextResponse.redirect(`${origin}${path}`);

  if (type === "recovery") {
    if (!tokenHash) return to("/reset-password");
    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    const userId = data?.user?.id;
    if (error || !userId) return to("/reset-password");
    const response = to(safeNextPath(searchParams.get("next"), "/reset-password"));
    setRecoveryCookie(response, userId);
    return response;
  }

  if (type && CONFIRM_TYPES.includes(type) && tokenHash) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    return to(error ? "/login" : "/app");
  }

  return to("/login");
}
