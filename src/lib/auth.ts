import { cache } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export type AuthUser = { id: string; email?: string };

/**
 * Returns the signed-in user, or redirects to /login.
 *
 * Wrapped in React `cache()` so the layout, page and any helper in the same
 * request share a single auth check. Uses `getClaims()`, which verifies the JWT
 * signature locally against the project's cached JWKS (asymmetric keys) and only
 * falls back to a network `getUser()` call for symmetric (HS*) keys.
 */
export const getUser = cache(async (): Promise<AuthUser> => {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  return { id: data.claims.sub, email: data.claims.email };
});
