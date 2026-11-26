"use client";

import { useState, type ReactNode } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { AttachmentService, supabaseAttachmentStorage } from "@/canvas/attachments/upload";
import { IdbRecordingOutbox } from "@/canvas/attachments/recording-outbox";
import { IdbOfflineQueue } from "@/canvas/persistence/idb-queue";
import { SupabaseSnapshotStore } from "@/canvas/persistence/supabase-snapshot-store";
import { SupabaseElementStore } from "@/canvas/persistence/supabase-store";
import { PersistentCanvas } from "@/canvas/react/PersistentCanvas";
import type { PreviewSink } from "@/canvas/preview/preview-scheduler";
import { touchPage } from "@/features/library/previews";

/** The page's canvas, saved to Supabase with an IndexedDB offline queue. */
export function PageCanvas({ pageId, ownerId, header }: { pageId: string; ownerId: string; header?: ReactNode }) {
  const [client] = useState(() => createBrowserClient());
  const [store] = useState(() => new SupabaseElementStore(client));
  const [snapshots] = useState(() => new SupabaseSnapshotStore(client));
  const [attachments] = useState(() => ({
    service: new AttachmentService(supabaseAttachmentStorage(client)),
    ownerId,
    pageId,
  }));
  const [queue] = useState(() => new IdbOfflineQueue(pageId));
  const [outbox] = useState(() => new IdbRecordingOutbox(pageId));
  // The card preview: upserted at {owner}/{page}/preview.jpg; a re-upload bumps pages.updated_at so cards re-fetch.
  const [preview] = useState<PreviewSink>(() => ({
    save: async (blob, { touch }) => {
      await attachments.service.uploadPreview(blob, { ownerId, pageId });
      if (touch) await touchPage(client, ownerId, pageId);
    },
    remove: () => attachments.service.removePreview({ ownerId, pageId }),
    exists: () => attachments.service.previewExists({ ownerId, pageId }),
  }));
  return (
    <PersistentCanvas
      key={pageId}
      pageId={pageId}
      store={store}
      queue={queue}
      attachments={attachments}
      outbox={outbox}
      snapshots={snapshots}
      header={header}
      preview={preview}
    />
  );
}
