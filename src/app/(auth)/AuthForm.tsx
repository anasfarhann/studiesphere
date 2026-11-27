"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authErrorMessage } from "@/lib/auth-errors";
import { createBrowserClient } from "@/lib/supabase/client";
import { t } from "@/i18n/en";
import { AuthShell, formClass } from "./AuthShell";
import { AltAction, EmailField, ForgotLink, FormHeading, FormMessages, PasswordField, SubmitButton } from "./fields";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = createBrowserClient();
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(authErrorMessage(error));
        else {
          router.push("/app");
          router.refresh();
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) setError(authErrorMessage(error));
        else if (data.session) {
          router.push("/app");
          router.refresh();
        } else setNotice(t("checkYourEmail"));
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      alt={
        <AltAction
          prompt={t(isLogin ? "newToApp" : "haveAccountPrefix")}
          href={isLogin ? "/signup" : "/login"}
          label={t(isLogin ? "createFreeAccount" : "signIn")}
        />
      }
    >
      <form onSubmit={onSubmit} className={formClass}>
        <FormHeading
          title={t(isLogin ? "signInTitle" : "signUpTitle")}
          subtitle={t(isLogin ? "signInSubtitle" : "signUpSubtitle")}
        />
        <EmailField />
        <PasswordField
          id="auth-password"
          name="password"
          label={t("password")}
          minLength={isLogin ? undefined : 8}
          autoComplete={isLogin ? "current-password" : "new-password"}
          aside={isLogin ? <ForgotLink /> : undefined}
        />
        <FormMessages error={error} notice={notice} />
        <SubmitButton busy={busy}>{t(isLogin ? "signIn" : "createAccountButton")}</SubmitButton>
      </form>
    </AuthShell>
  );
}
