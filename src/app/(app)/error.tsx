"use client";

import { useEffect } from "react";
import { t } from "@/i18n/en";
import { PillButton } from "@/ui/Button";

/**
 * Safety net for anything under /app that throws while rendering (server or client). Shows a calm,
 * translated message instead of Next's default crash page; "Try again" re-fetches and re-renders the segment.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex flex-1 items-center justify-center p-5">
      <div role="alert" className="flex w-full max-w-md flex-col items-start gap-3 rounded-[28px] bg-card p-6 text-ink">
        <h1 className="text-xl font-semibold">{t("appErrorTitle")}</h1>
        <p className="text-[15px] text-muted">{t("appErrorBody")}</p>
        <PillButton type="button" onClick={() => retry()} className="mt-1">
          {t("tryAgain")}
        </PillButton>
      </div>
    </main>
  );
}
