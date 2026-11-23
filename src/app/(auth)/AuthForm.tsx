"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authErrorMessage } from "@/lib/auth-errors";
import { createBrowserClient } from "@/lib/supabase/client";
import { t } from "@/i18n/en";
import { BrandPanel } from "@/ui/BrandPanel";

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

  const inputClass =
    "h-[52px] w-full rounded-2xl border-0 bg-ground px-[18px] text-[15px] text-ink placeholder:text-muted/70";
  return (
    <main className="flex min-h-dvh flex-1 flex-col gap-5 bg-ground p-3 sm:p-5 lg:flex-row">
      <BrandPanel className="lg:flex-1" />
      <section
        aria-labelledby="auth-heading"
        className="flex min-w-0 items-center justify-center rounded-[32px] bg-card p-6 sm:p-10 lg:flex-1"
      >
        <form onSubmit={onSubmit} className="flex w-full max-w-[380px] flex-col gap-[18px]">
          <div className="mb-2 flex flex-col gap-2">
            <h1 id="auth-heading" className="m-0 text-4xl font-medium tracking-tight">
              {t(isLogin ? "signInTitle" : "signUpTitle")}
            </h1>
            <p className="m-0 text-[15px] text-muted">{t(isLogin ? "signInSubtitle" : "signUpSubtitle")}</p>
          </div>
          <label className="flex flex-col gap-2 text-sm font-medium">
            {t("email")}
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            {t("password")}
            <input
              name="password"
              type="password"
              required
              minLength={isLogin ? undefined : 8}
              autoComplete={isLogin ? "current-password" : "new-password"}
              className={inputClass}
            />
          </label>
          {error && <p role="alert" className="m-0 text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="m-0 text-sm">{notice}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-1.5 h-[54px] cursor-pointer rounded-full bg-ink px-5 text-base font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t(isLogin ? "signIn" : "signUp")}
          </button>
          <p className="m-0 text-center text-sm text-muted">
            {t(isLogin ? "newHere" : "haveAccountPrefix")}{" "}
            <Link
              href={isLogin ? "/signup" : "/login"}
              className="inline-flex min-h-11 items-center font-semibold text-ink underline"
            >
              {t(isLogin ? "createAccount" : "signIn")}
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
