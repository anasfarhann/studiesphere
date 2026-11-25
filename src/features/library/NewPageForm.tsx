"use client";

import { useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { t } from "@/i18n/en";
import { PillButton } from "@/ui/Button";
import { Icon } from "@/ui/icons";
import { createQuickPageAction } from "./actions";

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

/** One-tap "New page". The button disables while the action runs, so a double tap submits once. */
export function NewPageForm({ variant, className }: { variant: "pill" | "rail"; className?: string }) {
  const tz = useSyncExternalStore(noSubscribe, browserZone, serverZone);
  return (
    <form action={createQuickPageAction} className="contents">
      <input type="hidden" name="tz" value={tz} />
      <Submit variant={variant} className={className} />
    </form>
  );
}
