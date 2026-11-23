"use client";

import { t, type en } from "@/i18n/en";
import type { SaveState } from "../persistence/store";

const LABEL: Record<SaveState, keyof typeof en> = {
  saved: "saveSaved",
  saving: "saveSaving",
  offline: "saveOffline",
  error: "saveError",
};

const DOT: Record<SaveState, string> = {
  saved: "bg-saved",
  saving: "bg-today",
  offline: "bg-amber-600",
  error: "bg-red-600",
};

/** `parked`: some batches were refused by the server and set aside (kept on this device). */
export function SaveStatus({ state, parked = false }: { state: SaveState; parked?: boolean }) {
  return (
    <p
      role="status"
      aria-live="polite"
      aria-label={t("saveStatusLabel")}
      data-testid="save-status"
      data-state={state}
      className="pointer-events-auto m-0 flex h-11 items-center gap-2 rounded-full bg-card px-4 text-sm font-medium text-ink shadow-[0_8px_28px_rgba(27,26,31,0.08)]"
    >
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${DOT[state]}`} />
      {t(parked && state === "error" ? "saveParked" : LABEL[state])}
    </p>
  );
}
