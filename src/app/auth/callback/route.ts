import { NextResponse, type NextRequest } from "next/server";
import { setRecoveryCookie } from "@/lib/recovery-cookie";
import { safeNextPath } from "@/lib/safe-next";
import { createServerClient } from "@/lib/supabase/server";

/**
 * PKCE email-link landing: exchanges `code` for a session, then goes to `next` (relative paths only).
 * Works only in the browser that requested the link (the code verifier lives there); cross-device links
 * go through /auth/confirm instead. A successful exchange bound for /reset-password also gets the
 * recovery cookie that unlocks the change-password form.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  if (code) {
    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`);
      if (next === "/reset-password" && data?.user?.id) setRecoveryCookie(response, data.user.id);
      return response;
    }
  }
  // A dead recovery link lands on the reset page, which explains the link expired.
  return NextResponse.redirect(`${origin}${next === "/reset-password" ? next : "/login"}`);
}
