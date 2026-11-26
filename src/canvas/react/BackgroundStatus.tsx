"use client";

import { t } from "@/i18n/en";
import type { BackgroundStatus as Status } from "../tools/remove-background";

export interface BackgroundStatusProps {
  status: Status;
  onCancel: () => void;
  onDismiss: () => void;
}

/** Progress chip while a photo's background is removed (with Cancel), or the failure notice. */
export function BackgroundStatus({ status, onCancel, onDismiss }: BackgroundStatusProps) {
  if (status.kind === "idle") return null;
  return (
    <div
      role="status"
      aria-label={t("removeBackgroundStatusLabel")}
      data-testid="background-status"
      className="pointer-events-auto inline-flex max-w-full touch-manipulation items-center gap-2 rounded-3xl bg-card py-1 pl-4 pr-1 text-sm text-ink shadow-[0_8px_28px_rgba(27,26,31,0.12)]"
    >
      {status.kind === "working" ? (
        <>
          <span className="min-w-0 py-2 font-medium tabular-nums">{t("removeBackgroundProgress", { percent: status.percent })}</span>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-full px-3 font-medium underline underline-offset-2"
          >
            {t("removeBackgroundCancel")}
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 py-2">{status.message}</span>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-full px-3 font-medium underline underline-offset-2"
          >
            {t("dismiss")}
          </button>
        </>
      )}
    </div>
  );
}
