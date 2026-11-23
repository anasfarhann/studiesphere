"use client";

import { t } from "@/i18n/en";
import type { FileStatus as Status } from "../tools/insert-file";

export interface FileStatusProps {
  status: Status;
  onRetry: () => void;
  onDismiss: () => void;
}

/** Small notice over the canvas while a file uploads, or when it failed. */
export function FileStatus({ status, onRetry, onDismiss }: FileStatusProps) {
  if (status.kind === "idle") return null;
  return (
    <div
      role="status"
      aria-label={t("fileStatusLabel")}
      data-testid="file-status"
      className="pointer-events-auto max-w-full touch-manipulation rounded-3xl bg-card px-4 py-2 text-sm text-ink shadow-[0_8px_28px_rgba(27,26,31,0.12)]"
    >
      {status.kind === "uploading" ? (
        t("fileUploading")
      ) : (
        <button type="button" className="min-h-11 rounded-full text-left font-medium underline" onClick={status.retryable ? onRetry : onDismiss}>
          {status.message}
        </button>
      )}
    </div>
  );
}
