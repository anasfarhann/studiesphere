"use client";

import { t, type en } from "@/i18n/en";
import type { SaveState } from "../persistence/store";

const LABEL: Record<SaveState, keyof typeof en> = {
  saved: "saveSaved",
  saving: "saveSaving",
  offline: "saveOffline",
  error: "saveError",
};

const TONE: Record<SaveState, string> = {
  saved: "text-gray-500",
  saving: "text-gray-500",
  offline: "text-amber-700",
  error: "text-red-700",
};

export function SaveStatus({ state }: { state: SaveState }) {
  return (
    <p
      role="status"
      aria-live="polite"
      aria-label={t("saveStatusLabel")}
      data-testid="save-status"
      data-state={state}
      className={`rounded bg-white/90 px-2 py-1 text-xs shadow-sm ${TONE[state]}`}
    >
      {t(LABEL[state])}
    </p>
  );
}
