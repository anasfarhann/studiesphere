"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authErrorMessage } from "@/lib/auth-errors";
import { createBrowserClient } from "@/lib/supabase/client";
import { t } from "@/i18n/en";
import { formClass } from "../AuthShell";
import { FormHeading, FormMessages, PasswordField, SubmitButton } from "../fields";
import { clearRecoveryCookie } from "./actions";

/**
 * New password + confirm for a recovery session. On success: sign out every other session, end the
 * recovery window (cookie), then go to /app with a notice.
 */
export function ResetPasswordForm({ email = null }: { email?: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Wrong account (e.g. someone else's recovery link): leave it without changing anything. */
  async function onNotYou() {
    setBusy(true);
    try {
      await createBrowserClient().auth.signOut({ scope: "local" }).catch(() => undefined);
      await clearRecoveryCookie().catch(() => undefined);
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

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
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setError(authErrorMessage(error));
      else {
        // Best effort: the password is already changed even if this fails.
        await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);
        await clearRecoveryCookie();
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
      {email && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-ground py-1 pr-2 pl-4">
          <p className="m-0 min-w-0 py-2 text-[15px] break-words text-ink">{t("resetForAccount", { email })}</p>
          <button
            type="button"
            onClick={onNotYou}
            disabled={busy}
            className="flex min-h-11 min-w-11 cursor-pointer items-center rounded-xl border-0 bg-transparent px-2 text-[13px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-ink disabled:cursor-default disabled:opacity-60"
          >
            {t("notYouSignOut")}
          </button>
        </div>
      )}
      <PasswordField id="new-password" name="password" label={t("newPassword")} minLength={8} autoComplete="new-password" placeholder={t("newPasswordPlaceholder")} />
      <PasswordField id="confirm-password" name="confirm" label={t("confirmPassword")} minLength={8} autoComplete="new-password" placeholder={t("confirmPasswordPlaceholder")} />
      <FormMessages error={error} notice={null} />
      <SubmitButton busy={busy}>{t("updatePassword")}</SubmitButton>
    </form>
  );
}
