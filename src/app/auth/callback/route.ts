import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/safe-next";
import { createServerClient } from "@/lib/supabase/server";

/** Email-link landing: exchanges the PKCE code for a session, then goes to `next` (relative paths only). */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  if (code) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  // A dead recovery link lands on the reset page, which explains the link expired.
  return NextResponse.redirect(`${origin}${next === "/reset-password" ? next : "/login"}`);
}
