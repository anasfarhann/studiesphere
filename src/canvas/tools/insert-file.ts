import { AttachmentError, MAX_ATTACHMENT_BYTES, type UploadOptions } from "../attachments/upload";
import { CARD_H, CARD_W } from "../model/bounds";
import { cleanFileName, fileExt } from "../model/file-card";
import type { History } from "../model/history";
import type { Scene } from "../model/scene";
import type { FileEl } from "../model/types";
import { t } from "@/i18n/en";

export type FileStatus =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "error"; message: string; retryable: boolean };

export interface FileInserterContext {
  scene: Scene;
  history: History;
  ownerId: string;
  pageId: string;
  /** Viewport centre in world units, read when a file is picked. */
  center: () => [number, number];
  upload: (file: Blob, opts: UploadOptions) => Promise<{ assetPath: string }>;
  newId?: () => string;
  now?: () => number;
}

type Pending = { blob: Blob; name: string; mime: string; bytes: number; ext: string; at: [number, number] };

/**
 * Uploads the original bytes first and only then adds the card (one undo step). A failed upload
 * adds nothing; retry() re-sends the same file. Deleting a card never removes the stored object.
 */
export class FileInserter {
  private _status: FileStatus = { kind: "idle" };
  private listeners = new Set<(s: FileStatus) => void>();
  private pending: Pending | null = null;
  private busy = false;
  private disposed = false;

  constructor(private ctx: FileInserterContext) {}

  get status(): FileStatus {
    return this._status;
  }

  onStatus(fn: (s: FileStatus) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  dismiss(): void {
    if (this.busy) return;
    this.pending = null;
    this.setStatus({ kind: "idle" });
  }

  async insert(file: File): Promise<void> {
    if (this.busy || this.disposed) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      this.pending = null;
      this.setStatus({ kind: "error", message: t("attachmentTooLarge"), retryable: false });
      return;
    }
    const mime = file.type || "application/octet-stream";
    this.pending = {
      // Same bytes, but a type is always set so storage serves it back sensibly.
      blob: file.type ? file : new Blob([file], { type: mime }),
      name: cleanFileName(file.name),
      mime,
      bytes: file.size,
      ext: fileExt(file.name.trim()),
      at: this.ctx.center(),
    };
    this.busy = true;
    this.setStatus({ kind: "uploading" });
    await this.send();
  }

  async retry(): Promise<void> {
    if (this.busy || this.disposed || !this.pending || this._status.kind !== "error" || !this._status.retryable) return;
    this.busy = true;
    this.setStatus({ kind: "uploading" });
    await this.send();
  }

  private async send(): Promise<void> {
    const p = this.pending;
    if (!p) return;
    try {
      const { assetPath } = await this.ctx.upload(p.blob, { ownerId: this.ctx.ownerId, pageId: this.ctx.pageId, ext: p.ext });
      this.busy = false;
      this.pending = null;
      if (this.disposed) return;
      this.add(p, assetPath);
      this.setStatus({ kind: "idle" });
    } catch (e) {
      this.busy = false;
      if (e instanceof AttachmentError && e.code === "too_large") {
        this.pending = null;
        this.setStatus({ kind: "error", message: e.message, retryable: false });
      } else {
        this.setStatus({ kind: "error", message: t("fileUploadFailed"), retryable: true });
      }
    }
  }

  private add(p: Pending, assetPath: string): void {
    const { scene, history } = this.ctx;
    const el: FileEl = {
      id: (this.ctx.newId ?? (() => crypto.randomUUID()))(),
      z: scene.nextZ(),
      updatedAt: (this.ctx.now ?? Date.now)(),
      type: "file",
      x: p.at[0] - CARD_W / 2,
      y: p.at[1] - CARD_H / 2,
      assetPath,
      fileName: p.name,
      mime: p.mime,
      bytes: p.bytes,
    };
    scene.add(el);
    history.push({ before: [], after: [el] });
  }

  private setStatus(s: FileStatus): void {
    this._status = s;
    if (this.disposed) return;
    for (const fn of [...this.listeners]) fn(s);
  }
}
