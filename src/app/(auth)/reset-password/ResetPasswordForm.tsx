"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authErrorMessage } from "@/lib/auth-errors";
import { createBrowserClient } from "@/lib/supabase/client";
import { t } from "@/i18n/en";
import { formClass } from "../AuthShell";
import { FormHeading, FormMessages, PasswordField, SubmitButton } from "../fields";

/** New password + confirm for a signed-in recovery session; on success goes to /app with a notice. */
export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) {
      setError(t("passwordsDontMatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error } = await createBrowserClient().auth.updateUser({ password });
      if (error) setError(authErrorMessage(error));
      else {
        router.push("/app?notice=password-updated");
        router.refresh();
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={formClass}>
      <FormHeading title={t("resetTitle")} subtitle={t("resetSubtitle")} />
      <PasswordField id="new-password" name="password" label={t("newPassword")} minLength={8} autoComplete="new-password" />
      <PasswordField id="confirm-password" name="confirm" label={t("confirmPassword")} minLength={8} autoComplete="new-password" />
      <FormMessages error={error} notice={null} />
      <SubmitButton busy={busy}>{t("updatePassword")}</SubmitButton>
    </form>
  );
}
