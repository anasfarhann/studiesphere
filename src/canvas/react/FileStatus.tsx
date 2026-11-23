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
      className="absolute left-3 top-14 z-10 touch-manipulation rounded bg-white px-3 py-2 text-sm text-gray-900 shadow"
    >
      {status.kind === "uploading" ? (
        t("fileUploading")
      ) : (
        <button type="button" className="min-h-11 text-left underline" onClick={status.retryable ? onRetry : onDismiss}>
          {status.message}
        </button>
      )}
    </div>
  );
}
