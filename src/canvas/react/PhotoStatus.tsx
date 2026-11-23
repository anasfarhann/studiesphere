"use client";

import { t } from "@/i18n/en";
import type { PhotoStatus as Status } from "../tools/insert-image";

export interface PhotoStatusProps {
  status: Status;
  onRetry: () => void;
  onDismiss: () => void;
}

/** Small notice over the canvas while a photo uploads, or when it failed. */
export function PhotoStatus({ status, onRetry, onDismiss }: PhotoStatusProps) {
  if (status.kind === "idle") return null;
  return (
    <div
      role="status"
      aria-label={t("photoStatusLabel")}
      data-testid="photo-status"
      className="absolute left-3 top-3 z-10 rounded bg-white px-3 py-2 text-sm shadow"
    >
      {status.kind === "uploading" ? (
        t("photoUploading")
      ) : (
        <button type="button" className="min-h-11 text-left underline" onClick={status.retryable ? onRetry : onDismiss}>
          {status.message}
        </button>
      )}
    </div>
  );
}
