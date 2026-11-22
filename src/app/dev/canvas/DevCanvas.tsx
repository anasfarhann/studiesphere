"use client";

import { useState } from "react";
import { MemoryElementStore, MemoryOfflineQueue } from "@/canvas/persistence/memory-store";
import { PersistentCanvas } from "@/canvas/react/PersistentCanvas";

const DEV_PAGE = "dev-page";

/** Dev canvas: same load/autosave path as a real page, but in memory (no network, nothing kept). */
export function DevCanvas() {
  const [store] = useState(() => new MemoryElementStore());
  const [queue] = useState(() => new MemoryOfflineQueue(DEV_PAGE));
  return <PersistentCanvas pageId={DEV_PAGE} store={store} queue={queue} />;
}
