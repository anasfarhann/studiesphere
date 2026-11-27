import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function createBrowserClient() {
  return createSsrBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * A throwaway implicit-flow client, only for requesting the password-reset email. With the default
 * (non-editable) "Reset Password" template, an implicit-flow request makes Supabase's verify endpoint
 * redirect to `redirectTo#access_token=…&type=recovery`, which works on any device; a PKCE request
 * needs the code verifier stored in the requesting browser.
 *
 * Built with supabase-js directly: @supabase/ssr's createBrowserClient always forces flowType "pkce"
 * (and hands back its cached singleton in the browser). It keeps no session, never reads the URL and
 * uses its own storage key so it cannot touch the app's cookie session.
 */
export function createImplicitFlowClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: {
      flowType: "implicit",
      persistSession: false,
      detectSessionInUrl: false,
      autoRefreshToken: false,
      storageKey: "ss-recovery-request",
    },
  });
}
