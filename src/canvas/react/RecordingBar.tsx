"use client";

import { useEffect, useState } from "react";
import { t } from "@/i18n/en";
import { formatDuration } from "../model/format-duration";
import type { AudioStatus } from "../tools/record-audio";

export interface RecordingBarProps {
  status: AudioStatus;
  onStop: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  /** Oversize recording: download it. */
  onSaveToDevice?: () => void;
  /** Oversize recording: the user is done with it (saved or discarded); drops the kept copy. */
  onDiscardOversize?: () => void;
}

function Timer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  return <span data-testid="recording-timer" className="tabular-nums">{formatDuration(now - startedAt)}</span>;
}

const action = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 text-sm";

/** Recording controls over the canvas: timer with Stop and Cancel, or the upload / error state. */
export function RecordingBar({ status, onStop, onCancel, onRetry, onDismiss, onSaveToDevice, onDiscardOversize }: RecordingBarProps) {
  if (status.kind === "idle") return null;
  return (
    <div
      role="status"
      aria-label={t("audioStatusLabel")}
      data-testid="audio-status"
      className="absolute bottom-4 left-1/2 z-10 flex touch-manipulation -translate-x-1/2 items-center gap-2 rounded-lg border bg-white px-3 py-1 text-sm text-gray-900 shadow"
    >
      {status.kind === "recording" ? (
        <>
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-red-600" />
          <span className="sr-only">{t("recordingBarLabel")}</span>
          <Timer startedAt={status.startedAt} />
          <button type="button" aria-label={t("recordingStop")} onClick={onStop} className={`${action} bg-gray-900 text-white`}>
            {t("recordingStop")}
          </button>
          <button type="button" aria-label={t("recordingCancel")} onClick={onCancel} className={`${action} border`}>
            {t("recordingCancel")}
          </button>
        </>
      ) : status.kind === "uploading" ? (
        t("audioUploading")
      ) : status.kind === "oversize" ? (
        <OversizeActions
          saved={status.saved}
          message={status.message}
          onSave={() => onSaveToDevice?.()}
          onDone={() => onDiscardOversize?.()}
        />
      ) : status.kind === "error" ? (
        <button type="button" className="min-h-11 text-left underline" onClick={status.retryable ? onRetry : onDismiss}>
          {status.message}
        </button>
      ) : (
        <>
          <span>{status.message}</span>
          <button type="button" aria-label={t("dismiss")} onClick={onDismiss} className={`${action} border`}>
            {t("dismiss")}
          </button>
        </>
      )}
    </div>
  );
}

export interface OversizeActionsProps {
  message: string;
  saved: boolean;
  onSave: () => void;
  /** Done (after saving) or Discard (confirmed): the kept copy may go. */
  onDone: () => void;
}

/** Save-to-device offer for a recording too large to upload. Nothing is removed without a tap. */
export function OversizeActions({ message, saved, onSave, onDone }: OversizeActionsProps) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{saved ? t("recordingSavedCheck") : message}</span>
      <button type="button" onClick={onSave} className={`${action} bg-gray-900 text-white`}>
        {t("recordingSaveToDevice")}
      </button>
      {saved ? (
        <button type="button" onClick={onDone} className={`${action} border`}>
          {t("recordingDone")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t("recordingDiscardConfirm"))) onDone();
          }}
          className={`${action} border text-red-700`}
        >
          {t("recordingDiscard")}
        </button>
      )}
    </span>
  );
}
