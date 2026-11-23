"use client";

import { useState } from "react";
import { t } from "@/i18n/en";
import { downloadBlob, recordingFileName } from "../attachments/download";
import { audioExt } from "../attachments/recorder";
import type { OutboxEntry, RecordingOutbox } from "../attachments/recording-outbox";
import { OversizeActions } from "./RecordingBar";

export interface OversizeRecordingsProps {
  entries: OutboxEntry[];
  outbox: RecordingOutbox;
  /** Called with an entry's id once it is removed from the outbox. */
  onRemoved: (id: string) => void;
  download?: (blob: Blob, fileName: string) => void;
}

/**
 * Recordings from an earlier visit that are too large to upload. Each one stays in the outbox
 * (and here) until the user saves it to the device and taps Done, or discards it.
 */
export function OversizeRecordings({ entries, outbox, onRemoved, download = downloadBlob }: OversizeRecordingsProps) {
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  if (entries.length === 0) return null;
  return (
    <div
      role="status"
      aria-label={t("oversizeRecordingsLabel")}
      data-testid="oversize-recordings"
      className="absolute bottom-20 left-1/2 z-10 flex -translate-x-1/2 flex-col gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 shadow"
    >
      {entries.map((e) => (
        <OversizeActions
          key={e.id}
          message={t("recordingTooLarge")}
          saved={saved.has(e.id)}
          onSave={() => {
            download(e.blob, recordingFileName(t("recordingFileName"), e.createdAt, audioExt(e.mime)));
            setSaved((s) => new Set(s).add(e.id));
          }}
          onDone={() => {
            void outbox.remove(e.id).then(
              () => onRemoved(e.id),
              () => {},
            );
          }}
        />
      ))}
    </div>
  );
}
