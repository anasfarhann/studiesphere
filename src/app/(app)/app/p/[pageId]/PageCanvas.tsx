"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { AttachmentService, supabaseAttachmentStorage } from "@/canvas/attachments/upload";
import { IdbOfflineQueue } from "@/canvas/persistence/idb-queue";
import { SupabaseElementStore } from "@/canvas/persistence/supabase-store";
import { PersistentCanvas } from "@/canvas/react/PersistentCanvas";

/** The page's canvas, saved to Supabase with an IndexedDB offline queue. */
export function PageCanvas({ pageId, ownerId }: { pageId: string; ownerId: string }) {
  const [client] = useState(() => createBrowserClient());
  const [store] = useState(() => new SupabaseElementStore(client));
  const [attachments] = useState(() => ({
    service: new AttachmentService(supabaseAttachmentStorage(client)),
    ownerId,
    pageId,
  }));
  const [queue] = useState(() => new IdbOfflineQueue(pageId));
  return <PersistentCanvas key={pageId} pageId={pageId} store={store} queue={queue} attachments={attachments} />;
}
