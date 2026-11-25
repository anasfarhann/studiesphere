import { compressImageWithSize, type CompressedImage } from "../attachments/compress-image";
import { AttachmentError, MAX_ATTACHMENT_BYTES, type UploadOptions } from "../attachments/upload";
import type { History } from "../model/history";
import type { Scene } from "../model/scene";
import type { ImageEl } from "../model/types";
import { t } from "@/i18n/en";

/** Photos start at most this wide (world units); the corner handle resizes from there. */
export const MAX_PHOTO_W = 480;

export type PhotoStatus =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "error"; message: string; retryable: boolean };

export interface PhotoInserterContext {
  scene: Scene;
  history: History;
  ownerId: string;
  pageId: string;
  /** Viewport centre in world units, read when a photo is picked. */
  center: () => [number, number];
  upload: (file: Blob, opts: UploadOptions) => Promise<{ assetPath: string }>;
  compress?: (file: File) => Promise<CompressedImage>;
  newId?: () => string;
  now?: () => number;
  /** Called with the new photo's id once it is on the page (also after a retried upload). */
  onInserted?: (id: string) => void;
}

type Pending = { image: CompressedImage; at: [number, number] };

/**
 * Compress, upload, and only then add the card (one undo step). A failed upload adds nothing and
 * keeps the compressed blob so retry() re-sends the very same bytes.
 */
export class PhotoInserter {
  private _status: PhotoStatus = { kind: "idle" };
  private listeners = new Set<(s: PhotoStatus) => void>();
  private pending: Pending | null = null;
  private busy = false;
  private disposed = false;

  constructor(private ctx: PhotoInserterContext) {}

  get status(): PhotoStatus {
    return this._status;
  }

  onStatus(fn: (s: PhotoStatus) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  /** Forgets a failed photo. */
  dismiss(): void {
    if (this.busy) return;
    this.pending = null;
    this.setStatus({ kind: "idle" });
  }

  async insert(file: File): Promise<void> {
    if (this.busy || this.disposed) return;
    // Refuse before decoding: a huge original should never reach the image decoder.
    if (file.size > MAX_ATTACHMENT_BYTES) {
      this.pending = null;
      this.setStatus({ kind: "error", message: t("attachmentTooLarge"), retryable: false });
      return;
    }
    this.busy = true;
    this.setStatus({ kind: "uploading" });
    try {
      const compress = this.ctx.compress ?? ((f: File) => compressImageWithSize(f));
      const image = await compress(file);
      this.pending = { image, at: this.ctx.center() };
    } catch {
      this.busy = false;
      this.setStatus({ kind: "error", message: t("photoUnreadable"), retryable: false });
      return;
    }
    await this.send();
  }

  async retry(): Promise<void> {
    if (this.busy || this.disposed || !this.pending || this._status.kind !== "error" || !this._status.retryable) return;
    this.busy = true;
    this.setStatus({ kind: "uploading" });
    await this.send();
  }

  private async send(): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    try {
      const { assetPath } = await this.ctx.upload(pending.image.blob, {
        ownerId: this.ctx.ownerId,
        pageId: this.ctx.pageId,
        ext: pending.image.blob.type === "image/png" ? "png" : "jpg",
      });
      this.busy = false;
      this.pending = null;
      if (this.disposed) return;
      this.add(pending, assetPath);
      this.setStatus({ kind: "idle" });
    } catch (e) {
      this.busy = false;
      if (e instanceof AttachmentError && e.code === "too_large") {
        this.pending = null;
        this.setStatus({ kind: "error", message: e.message, retryable: false });
      } else {
        this.setStatus({ kind: "error", message: t("photoUploadFailed"), retryable: true });
      }
    }
  }

  private add(p: Pending, assetPath: string): void {
    const { scene, history } = this.ctx;
    const w = Math.min(MAX_PHOTO_W, p.image.width);
    const h = (w * p.image.height) / p.image.width;
    const el: ImageEl = {
      id: (this.ctx.newId ?? (() => crypto.randomUUID()))(),
      z: scene.nextZ(),
      updatedAt: (this.ctx.now ?? Date.now)(),
      type: "image",
      x: p.at[0] - w / 2,
      y: p.at[1] - h / 2,
      w,
      h,
      assetPath,
    };
    scene.add(el);
    history.push({ before: [], after: [el] });
    this.ctx.onInserted?.(el.id);
  }

  private setStatus(s: PhotoStatus): void {
    this._status = s;
    if (this.disposed) return;
    for (const fn of [...this.listeners]) fn(s);
  }
}
