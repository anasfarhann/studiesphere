"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { t } from "@/i18n/en";
import { PillButton } from "@/ui/Button";
import { Icon } from "@/ui/icons";
import { createQuickPageAction } from "./actions";
import type { FormState } from "./form-error";

function Submit({ variant, className }: { variant: "pill" | "rail"; className?: string }) {
  const { pending } = useFormStatus();
  if (variant === "pill") {
    return (
      <PillButton type="submit" icon="plus" className={className} disabled={pending}>
        {t("navNewPage")}
      </PillButton>
    );
  }
  return (
    <button type="submit" aria-label={t("navNewPage")} title={t("navNewPage")} disabled={pending} className={className}>
      <Icon name="plus" />
    </button>
  );
}

const noSubscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone = () => "";

/**
 * One-tap "New page". The button disables while the action runs, so a double tap submits once. A failure is
 * shown inline (pill: on its own line in the row; rail: a small dismissible popover beside the button).
 */
export function NewPageForm({ variant, className }: { variant: "pill" | "rail"; className?: string }) {
  const tz = useSyncExternalStore(noSubscribe, browserZone, serverZone);
  const [state, action] = useActionState(createQuickPageAction, null);
  // Each failed submit returns a fresh object, so dismissing hides only that one.
  const [dismissed, setDismissed] = useState<FormState>(null);
  const error = state && state !== dismissed ? t("quickPageError") : null;
  const form = (
    <form action={action} className="contents">
      <input type="hidden" name="tz" value={tz} />
      <Submit variant={variant} className={className} />
    </form>
  );
  if (variant === "pill") {
    return (
      <>
        {form}
        {error ? (
          <p role="alert" className="order-last basis-full text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </>
    );
  }
  return (
    <div className="relative">
      {form}
      {error ? (
        <div
          role="alert"
          className="absolute bottom-full left-0 z-40 mb-2 flex w-60 max-w-[calc(100vw-1rem)] items-center gap-2 rounded-3xl bg-card py-1 pr-1 pl-4 text-sm text-red-700 shadow-[0_8px_28px_rgba(27,26,31,0.12)] md:top-0 md:bottom-auto md:left-full md:mb-0 md:ml-3"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            aria-label={t("quickPageErrorDismiss")}
            onClick={() => setDismissed(state)}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
