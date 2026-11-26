"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { AttachmentService, type AttachmentStorage } from "@/canvas/attachments/upload";
import type { PreviewSink } from "@/canvas/preview/preview-scheduler";
import type { CanvasElement } from "@/canvas/model/types";
import type { RemoveBackgroundFn } from "@/canvas/tools/remove-background";
import { MemoryElementStore, MemoryOfflineQueue } from "@/canvas/persistence/memory-store";
import type { ElementStore, Tombstone } from "@/canvas/persistence/store";
import { MemorySnapshotStore } from "@/canvas/persistence/memory-snapshot-store";
import { PersistentCanvas } from "@/canvas/react/PersistentCanvas";
import { FileStatus } from "@/canvas/react/FileStatus";
import { PhotoStatus } from "@/canvas/react/PhotoStatus";
import { RecordingBar } from "@/canvas/react/RecordingBar";

declare global {
  interface Window {
    /** e2e hook: the last page preview the dev canvas made. */
    __devPreview?: { type: string; bytes: number; width: number; height: number };
  }
}

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
    remove: async (paths) => {
      for (const p of paths) blobs.delete(p);
      return { error: null };
    },
    createSignedUrl: async (path) => {
      if (path === DEMO_THUMB_PATH) return { url: DEMO_THUMB_URL, error: null };
      const blob = blobs.get(path);
      return blob ? { url: URL.createObjectURL(blob), error: null } : { url: null, error: { message: "not found" } };
    },
  };
}

/**
 * `?remover=stub` (e2e): a fake background remover that reports progress over about 1.5 s, then clears the left
 * half of the photo; `?remover=fail` reports some progress, then fails. Both honour Cancel. `?remover=offline`:
 * the real remover with an unreachable model host. Without the
 * parameter the real on-device remover runs (it downloads its model on first use).
 */
function stubRemover(mode: string | null): RemoveBackgroundFn | undefined {
  // The real worker remover, with its model host unreachable: the download fails (e2e of the failure path).
  if (mode === "offline")
    return async (image, opts) => (await import("@/canvas/tools/remove-background-client")).createWorkerRemover({ publicPath: "http://127.0.0.1:9/" })(image, opts);
  if (mode !== "stub" && mode !== "fail") return undefined;
  return (image, { onProgress, signal }) =>
    new Promise<Blob>((resolve, reject) => {
      let step = 0;
      const abort = () => {
        clearInterval(timer);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      };
      signal.addEventListener("abort", abort);
      const timer = setInterval(() => {
        step++;
        onProgress(step / 10, step < 4 ? "download" : "compute");
        if (mode === "fail" && step === 4) {
          clearInterval(timer);
          reject(new Error("stub failure"));
        }
        if (step < 10) return;
        clearInterval(timer);
        signal.removeEventListener("abort", abort);
        void createImageBitmap(image).then((bmp) => {
          const c = document.createElement("canvas");
          c.width = bmp.width;
          c.height = bmp.height;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(bmp, 0, 0);
          ctx.clearRect(0, 0, bmp.width / 2, bmp.height);
          c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/png");
        }, reject);
      }, 150);
    });
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
    removeBackground: stubRemover(typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("remover")),
  }));
  // Previews go to the in-memory bucket; the last one is exposed for e2e (dev only).
  const [preview] = useState<PreviewSink>(() => ({
    save: async (blob) => {
      await attachments.service.uploadPreview(blob, { ownerId: attachments.ownerId, pageId: DEV_PAGE });
      const bitmap = await createImageBitmap(blob).catch(() => null);
      window.__devPreview = { type: blob.type, bytes: blob.size, width: bitmap?.width ?? 0, height: bitmap?.height ?? 0 };
      bitmap?.close();
    },
    remove: () => attachments.service.removePreview({ ownerId: attachments.ownerId, pageId: DEV_PAGE }),
    exists: () => attachments.service.previewExists({ ownerId: attachments.ownerId, pageId: DEV_PAGE }),
  }));
  const search = useSyncExternalStore(subscribeNone, readSearch, () => "");
  const extra: ReactNode = new URLSearchParams(search).get("demo") === "notices" ? <DemoNotices /> : null;
  return <PersistentCanvas pageId={DEV_PAGE} store={store} queue={queue} attachments={attachments} snapshots={snapshots} extraNotices={extra} preview={preview} />;
}
