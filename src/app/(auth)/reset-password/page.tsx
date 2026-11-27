import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { RECOVERY_COOKIE, recoveryAllowed, recoverySecret } from "@/lib/recovery-cookie";
import { createServerClient } from "@/lib/supabase/server";
import { t } from "@/i18n/en";
import { AuthShell } from "../AuthShell";
import { AltAction, FormHeading } from "../fields";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: `${t("resetTitle")} · ${t("appName")}` };

async function inRecovery(): Promise<boolean> {
  const supabase = await createServerClient();
  const [{ data }, cookieStore] = await Promise.all([supabase.auth.getClaims(), cookies()]);
  return recoveryAllowed({
    claims: data?.claims,
    cookie: cookieStore.get(RECOVERY_COOKIE)?.value,
    now: Date.now(),
    secret: recoverySecret(),
  });
}

/**
 * Landing page of the recovery email (via /auth/confirm or /auth/callback). Being signed in is not enough:
 * the form needs the server-signed recovery cookie for the same user (or a fresh `recovery` amr).
 */
export default async function ResetPasswordPage() {
  if (!(await inRecovery())) {
    return (
      <AuthShell alt={<AltAction prompt={t("rememberedPassword")} href="/login" label={t("signIn")} />}>
        <div className="flex flex-col gap-4 lg:gap-[18px]">
          <FormHeading title={t("resetExpiredTitle")} subtitle={t("resetExpiredBody")} />
          <Link
            href="/forgot-password"
            className="mt-1 flex h-[54px] items-center justify-center rounded-full bg-ink px-5 text-base font-semibold text-white no-underline shadow-[0_10px_24px_rgb(27_26_31/0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:h-14"
          >
            {t("requestNewLink")}
          </Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <ResetPasswordForm />
    </AuthShell>
  );
}
