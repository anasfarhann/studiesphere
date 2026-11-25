"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { AttachmentService, type AttachmentStorage } from "@/canvas/attachments/upload";
import type { CanvasElement } from "@/canvas/model/types";
import { MemoryElementStore, MemoryOfflineQueue } from "@/canvas/persistence/memory-store";
import type { ElementStore, Tombstone } from "@/canvas/persistence/store";
import { MemorySnapshotStore } from "@/canvas/persistence/memory-snapshot-store";
import { PersistentCanvas } from "@/canvas/react/PersistentCanvas";
import { FileStatus } from "@/canvas/react/FileStatus";
import { PhotoStatus } from "@/canvas/react/PhotoStatus";
import { RecordingBar } from "@/canvas/react/RecordingBar";

const noop = () => {};
const DEMO_STARTED = 0;
const subscribeNone = () => noop;
const readSearch = () => window.location.search;

/** `?demo=notices`: a photo, a file and a recording notice at once, to check how they stack (e2e). */
function DemoNotices() {
  return (
    <>
      <PhotoStatus status={{ kind: "uploading" }} onRetry={noop} onDismiss={noop} />
      <FileStatus status={{ kind: "uploading" }} onRetry={noop} onDismiss={noop} />
      <RecordingBar status={{ kind: "recording", startedAt: DEMO_STARTED }} onStop={noop} onCancel={noop} onRetry={noop} onDismiss={noop} />
    </>
  );
}

const DEV_PAGE = "dev-page";
const DEMO_THUMB_PATH = "dev-owner/dev-page/demo.thumb.jpg";
/** A pale-blue page preview, so the e2e can see an image render without a real PDF. */
const DEMO_THUMB_URL = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="#dbeafe"/><rect x="40" y="40" width="400" height="24" fill="#2563eb"/></svg>')}`;
const DEMO_FILE: CanvasElement = { id: "demo-file", z: 0, updatedAt: 1, type: "file", x: 120, y: 260, assetPath: "dev-owner/dev-page/demo.pdf", fileName: "demo.pdf", mime: "application/pdf", bytes: 2048, thumbPath: DEMO_THUMB_PATH };
const KEY = "dev-canvas-elements";

/** Dev-only: the in-memory store, mirrored to sessionStorage so a reload keeps the page (e2e). */
class SessionElementStore implements ElementStore {
  private inner = new MemoryElementStore();
  private seeded = false;

  async load(pageId: string): Promise<CanvasElement[]> {
    if (!this.seeded) {
      this.seeded = true;
      if (new URLSearchParams(window.location.search).get("demo") === "thumb") await this.inner.save(pageId, [DEMO_FILE], []);
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
      if (path === DEMO_THUMB_PATH) return { url: DEMO_THUMB_URL, error: null };
      const blob = blobs.get(path);
      return blob ? { url: URL.createObjectURL(blob), error: null } : { url: null, error: { message: "not found" } };
    },
  };
}

/** Dev canvas: same load/autosave path as a real page, but no network; kept per browser tab session. */
export function DevCanvas() {
  const [store] = useState(() => new SessionElementStore());
  const [queue] = useState(() => new MemoryOfflineQueue(DEV_PAGE));
  const [snapshots] = useState(() => new MemorySnapshotStore());
  const [attachments] = useState(() => ({
    service: new AttachmentService(memoryAttachmentStorage()),
    ownerId: "dev-owner",
    pageId: DEV_PAGE,
  }));
  const search = useSyncExternalStore(subscribeNone, readSearch, () => "");
  const extra: ReactNode = new URLSearchParams(search).get("demo") === "notices" ? <DemoNotices /> : null;
  return <PersistentCanvas pageId={DEV_PAGE} store={store} queue={queue} attachments={attachments} snapshots={snapshots} extraNotices={extra} />;
}
