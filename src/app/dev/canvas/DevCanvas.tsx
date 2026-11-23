"use client";

import { useState } from "react";
import { AttachmentService, type AttachmentStorage } from "@/canvas/attachments/upload";
import type { CanvasElement } from "@/canvas/model/types";
import { MemoryElementStore, MemoryOfflineQueue } from "@/canvas/persistence/memory-store";
import type { ElementStore, Tombstone } from "@/canvas/persistence/store";
import { PersistentCanvas } from "@/canvas/react/PersistentCanvas";

const DEV_PAGE = "dev-page";
const KEY = "dev-canvas-elements";

/** Dev-only: the in-memory store, mirrored to sessionStorage so a reload keeps the page (e2e). */
class SessionElementStore implements ElementStore {
  private inner = new MemoryElementStore();
  private seeded = false;

  async load(pageId: string): Promise<CanvasElement[]> {
    if (!this.seeded) {
      this.seeded = true;
      try {
        const raw = window.sessionStorage.getItem(KEY);
        if (raw) await this.inner.save(pageId, JSON.parse(raw) as CanvasElement[], []);
      } catch {
        // Storage unavailable or corrupt: start empty.
      }
    }
    return this.inner.load(pageId);
  }

  async save(pageId: string, upserts: CanvasElement[], deletes: Tombstone[]): Promise<void> {
    await this.inner.save(pageId, upserts, deletes);
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(await this.inner.load(pageId)));
    } catch {
      // Quota or storage unavailable: dev only, ignore.
    }
  }
}

/** Dev-only uploader: keeps blobs in memory and signs them as object URLs (lost on reload). */
function memoryAttachmentStorage(): AttachmentStorage {
  const blobs = new Map<string, Blob>();
  return {
    upload: async (path, body) => {
      blobs.set(path, body);
      return { error: null };
    },
    createSignedUrl: async (path) => {
      const blob = blobs.get(path);
      return blob ? { url: URL.createObjectURL(blob), error: null } : { url: null, error: { message: "not found" } };
    },
  };
}

/** Dev canvas: same load/autosave path as a real page, but no network; kept per browser tab session. */
export function DevCanvas() {
  const [store] = useState(() => new SessionElementStore());
  const [queue] = useState(() => new MemoryOfflineQueue(DEV_PAGE));
  const [attachments] = useState(() => ({
    service: new AttachmentService(memoryAttachmentStorage()),
    ownerId: "dev-owner",
    pageId: DEV_PAGE,
  }));
  return <PersistentCanvas pageId={DEV_PAGE} store={store} queue={queue} attachments={attachments} />;
}
