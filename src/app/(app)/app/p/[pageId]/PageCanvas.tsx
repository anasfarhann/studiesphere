"use client";

import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { IdbOfflineQueue } from "@/canvas/persistence/idb-queue";
import { SupabaseElementStore } from "@/canvas/persistence/supabase-store";
import { PersistentCanvas } from "@/canvas/react/PersistentCanvas";

/** The page's canvas, saved to Supabase with an IndexedDB offline queue. */
export function PageCanvas({ pageId }: { pageId: string }) {
  const [store] = useState(() => new SupabaseElementStore(createBrowserClient()));
  const [queue] = useState(() => new IdbOfflineQueue(pageId));
  return <PersistentCanvas key={pageId} pageId={pageId} store={store} queue={queue} />;
}
