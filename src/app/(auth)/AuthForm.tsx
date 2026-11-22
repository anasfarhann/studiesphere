"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authErrorMessage } from "@/lib/auth-errors";
import { createBrowserClient } from "@/lib/supabase/client";
import { t } from "@/i18n/en";

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
    <main className="flex flex-1 flex-col items-center justify-center p-8">
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t(isLogin ? "signInTitle" : "signUpTitle")}</h1>
        <label className="flex flex-col gap-1">
          {t("email")}
          <input name="email" type="email" required autoComplete="email" className="rounded-md border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          {t("password")}
          <input
            name="password"
            type="password"
            required
            minLength={isLogin ? undefined : 8}
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="rounded-md border px-3 py-2"
          />
        </label>
        {error && <p role="alert" className="text-red-600">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <button type="submit" disabled={busy} className="rounded-md bg-foreground px-5 py-2 font-medium text-background">
          {t(isLogin ? "signIn" : "signUp")}
        </button>
        <Link href={isLogin ? "/signup" : "/login"} className="text-sm underline">
          {t(isLogin ? "noAccountYet" : "haveAccount")}
        </Link>
      </form>
    </main>
  );
}
