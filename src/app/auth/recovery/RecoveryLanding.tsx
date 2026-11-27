"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { t } from "@/i18n/en";

const RESET = "/reset-password";
const TIMEOUT_MS = 15_000;

/**
 * Landing of the default "Reset Password" email (implicit flow). Supabase's verify endpoint redirects
 * here with `#access_token=…&refresh_token=…&type=recovery`, or `#error=…&error_code=otp_expired…`.
 *
 * - The tokens travel only in the URL fragment, which browsers never send to a server (so they are not
 *   in our request logs), and the fragment is stripped with history.replaceState before anything else
 *   so they do not linger in the address bar or history.
 * - Only type=recovery is accepted; the server additionally requires a fresh `recovery` amr (login-CSRF
 *   mitigation, see /auth/recovery/session).
 * - Every outcome lands on /reset-password: it shows the form when the recovery cookie was set, and the
 *   "link has expired" state otherwise.
 * - A hung request is aborted after 15 s, so the page never sits on "Checking your link…" forever.
 * - Never log the tokens.
 */
export function RecoveryLanding() {
  const router = useRouter();
  // StrictMode runs effects twice in development; the fragment is already gone on the second run.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (params.get("error") || params.get("error_code") || params.get("type") !== "recovery" || !accessToken || !refreshToken) {
      router.replace(RESET);
      return;
    }

    fetch("/auth/recovery/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
      .catch(() => undefined)
      // Success and failure both go to the reset page, which decides between the form and "expired".
      .finally(() => router.replace(RESET));
  }, [router]);

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-3 bg-ground p-4">
      <p role="status" aria-live="polite" className="m-0 text-[15px] text-muted">
        {t("checkingLink")}
      </p>
      <noscript>
        <p className="m-0 max-w-sm text-center text-[15px] text-ink">
          {t("noscriptRecovery")}{" "}
          <a href="/forgot-password" className="font-semibold text-ink underline underline-offset-2">
            {t("requestNewLink")}
          </a>
        </p>
      </noscript>
    </main>
  );
}
