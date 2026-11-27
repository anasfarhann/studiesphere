"use client";

import { useState, type FormEvent } from "react";
import { authErrorMessage, isTransientAuthError } from "@/lib/auth-errors";
import { createImplicitFlowClient } from "@/lib/supabase/client";
import { t } from "@/i18n/en";
import { AuthShell, formClass } from "../AuthShell";
import { AltAction, EmailField, FormHeading, FormMessages, SubmitButton } from "../fields";

/**
 * Sends a password-reset email. Whatever Supabase says about the address, the user sees the same
 * neutral message (no account enumeration); only network failures and rate limits are reported.
 *
 * Requested in implicit flow so the default email link works on any device: Supabase redirects to
 * /auth/recovery with the session in the URL fragment (see that page for the security notes).
 */
export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email"));
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error } = await createImplicitFlowClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/recovery`,
      });
      if (error && isTransientAuthError(error)) setError(authErrorMessage(error));
      else setNotice(t("resetLinkSent"));
    } catch (err) {
      if (isTransientAuthError(err)) setError(authErrorMessage(err));
      else setNotice(t("resetLinkSent"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell alt={<AltAction prompt={t("rememberedPassword")} href="/login" label={t("signIn")} />}>
      <form onSubmit={onSubmit} className={formClass}>
        <FormHeading title={t("forgotTitle")} subtitle={t("forgotSubtitle")} />
        <EmailField />
        <FormMessages error={error} notice={notice} />
        <SubmitButton busy={busy}>{t("sendResetLink")}</SubmitButton>
      </form>
    </AuthShell>
  );
}
