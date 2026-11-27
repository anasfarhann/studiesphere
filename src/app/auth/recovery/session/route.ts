import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isFreshRecovery, setRecoveryCookie } from "@/lib/recovery-cookie";
import type { Database } from "@/lib/supabase/types";

/** Two JWT-sized tokens fit easily; anything bigger is not a real recovery post. */
const MAX_BODY_BYTES = 16 * 1024;

type CookieToSet = { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] };

/**
 * Turns the tokens from a recovery link's URL fragment (posted by /auth/recovery) into the cookie
 * session plus the `ss_recovery` cookie that unlocks /reset-password.
 *
 * Security:
 * - Bodies over 16 KB get 413 (by content-length before reading, and by length after reading).
 * - POST + JSON only, and the Origin header must be this origin: a cross-site page cannot post tokens
 *   here (JSON content-type also forces a CORS preflight that we never answer).
 * - setSession checks the tokens with Supabase (getUser, or a refresh for an expired access token).
 * - Login CSRF: someone could hand you a link carrying THEIR recovery tokens, which would sign you into
 *   their account. We only accept a token whose verified claims carry a `recovery` amr from the last
 *   15 minutes (so an ordinary leaked session token cannot be planted here), and /reset-password shows
 *   the account's email so a wrong account is noticed before a password is chosen.
 * - Anything that set a session but is not a fresh recovery is signed out again (local scope) so no
 *   session is left behind, and gets 403 without the recovery cookie.
 * - Tokens are never logged.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return status(403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return status(400);

  const declared = request.headers.get("content-length");
  if (declared !== null && !(Number(declared) <= MAX_BODY_BYTES)) return status(413);

  let text: string;
  try {
    text = await request.text();
  } catch {
    return status(400);
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return status(413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return status(400);
  }
  const { access_token, refresh_token } = (body ?? {}) as Record<string, unknown>;
  if (typeof access_token !== "string" || typeof refresh_token !== "string" || !access_token || !refresh_token) {
    return status(400);
  }

  // The project's proxy pattern: read the request's cookies, collect what Supabase writes, and copy it
  // onto whichever response we return (so the session cookies, or their removal, actually ship).
  const pending: CookieToSet[] = [];
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach((c) => request.cookies.set(c.name, c.value));
          pending.push(...toSet);
        },
      },
    },
  );
  const respond = (code: number) => {
    const response = status(code);
    pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    return response;
  };

  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  const userId = data?.user?.id;
  const session = data?.session;
  if (error || !userId || !session) return respond(403);

  const { data: claimsData } = await supabase.auth.getClaims(session.access_token);
  const claims = claimsData?.claims;
  if (!claims || claims.sub !== userId || !isFreshRecovery(claims, Date.now())) return refuse();

  const response = respond(204);
  if (!setRecoveryCookie(response, userId)) return refuse(); // no secret configured: fail closed
  return response;

  async function refuse() {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return respond(403);
  }
}

function status(code: number) {
  return new NextResponse(null, { status: code, headers: { "cache-control": "no-store" } });
}
