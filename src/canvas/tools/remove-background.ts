import { AttachmentError, type UploadOptions } from "../attachments/upload";
import type { History } from "../model/history";
import type { Scene } from "../model/scene";
import type { ImageEl } from "../model/types";
import { t } from "@/i18n/en";

/** Photos are scaled down to at most this long side before processing (memory on iPad). */
export const MAX_BG_SIDE = 2048;

/** What the remover is doing: fetching its model (first use only, then from the browser cache) or computing. */
export type RemovePhase = "download" | "compute";

export interface RemoveOptions {
  maxSide: number;
  /** Share done (0-1) of the removal itself, and its phase. */
  onProgress: (fraction: number, phase: RemovePhase) => void;
  /** Aborting stops the work (the worker is terminated) and rejects with an AbortError. */
  signal: AbortSignal;
}

/** Takes the original photo, returns it as a PNG with a transparent background, same aspect ratio. */
export type RemoveBackgroundFn = (image: Blob, opts: RemoveOptions) => Promise<Blob>;

export type BackgroundStatus =
  | { kind: "idle" }
  | { kind: "working"; id: string; percent: number; downloading: boolean }
  | { kind: "error"; message: string };

export interface BackgroundRemoverContext {
  scene: Scene;
  history: History;
  ownerId: string;
  pageId: string;
  /** The photo's stored bytes (fetched through its signed URL, never read back from a possibly tainted <img>). */
  fetchOriginal: (assetPath: string) => Promise<Blob>;
  upload: (file: Blob, opts: UploadOptions) => Promise<{ assetPath: string }>;
  /** Defaults to the on-device remover, loaded (with its worker) on first use. */
  remove?: RemoveBackgroundFn;
}

/** The on-device remover, loaded on first use: neither it nor the library is in the page's initial chunks. */
export const loadDefaultRemover: () => Promise<RemoveBackgroundFn> = async () =>
  (await import("./remove-background-client")).removeBackgroundInWorker;

/** Progress reported to the user: fetching the original 0-5 %, the removal 5-90 %, the upload 90-100 %. */
const FETCH_END = 5;
const REMOVE_END = 90;

function isAbort(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

/**
 * Remove background for one photo: fetch its original, remove the background on the device, upload the PNG
 * and only then point the element at it (one undo step back to the original path; position, size and crop
 * kept). One run at a time. Cancel, a failure, or the photo changing meanwhile leaves the element as it was.
 */
export class BackgroundRemover {
  private _status: BackgroundStatus = { kind: "idle" };
  private listeners = new Set<(s: BackgroundStatus) => void>();
  private run: { id: string; abort: AbortController; percent: number; downloading: boolean } | null = null;
  private disposed = false;

  constructor(private ctx: BackgroundRemoverContext) {}

  get status(): BackgroundStatus {
    return this._status;
  }

  get busy(): boolean {
    return this.run !== null;
  }

  onStatus(fn: (s: BackgroundStatus) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Stops the run in progress; the photo stays as it was. */
  cancel(): void {
    const run = this.run;
    if (!run) return;
    this.run = null;
    run.abort.abort();
    this.setStatus({ kind: "idle" });
  }

  /** Clears an error notice. */
  dismiss(): void {
    if (this._status.kind === "error") this.setStatus({ kind: "idle" });
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
    this.listeners.clear();
  }

  async start(id: string): Promise<void> {
    if (this.run || this.disposed) return;
    const el = this.ctx.scene.get(id);
    if (!el || el.type !== "image") return;
    const sourcePath = el.assetPath;
    const run = { id, abort: new AbortController(), percent: 0, downloading: false };
    this.run = run;
    const live = () => this.run === run;
    const report = (percent: number, downloading: boolean) => {
      if (!live()) return;
      run.percent = Math.max(run.percent, Math.min(100, Math.round(percent)));
      run.downloading = downloading;
      this.setStatus({ kind: "working", id, percent: run.percent, downloading });
    };
    report(0, false);
    try {
      const original = await this.ctx.fetchOriginal(sourcePath);
      if (!live()) return;
      report(FETCH_END, false);
      const remove = this.ctx.remove ?? (await loadDefaultRemover());
      if (!live()) return;
      const png = await remove(original, {
        maxSide: MAX_BG_SIDE,
        signal: run.abort.signal,
        onProgress: (f, phase) => report(FETCH_END + (REMOVE_END - FETCH_END) * Math.min(1, Math.max(0, f)), phase === "download"),
      });
      if (!live()) return;
      report(REMOVE_END, false);
      const { assetPath } = await this.ctx.upload(png, { ownerId: this.ctx.ownerId, pageId: this.ctx.pageId, ext: "png" });
      if (!live()) return;
      this.run = null;
      this.replace(id, sourcePath, assetPath);
      this.setStatus({ kind: "idle" });
    } catch (e) {
      if (!live()) return;
      this.run = null;
      if (isAbort(e)) return this.setStatus({ kind: "idle" });
      console.warn("Background removal failed:", e instanceof Error ? e.message : e);
      const tooLarge = e instanceof AttachmentError && e.code === "too_large";
      this.setStatus({ kind: "error", message: tooLarge ? t("attachmentTooLarge") : t("removeBackgroundFailed") });
    }
  }

  /** Points the element at the new asset, unless it was removed or its photo changed meanwhile. */
  private replace(id: string, sourcePath: string, assetPath: string): void {
    const { scene, history } = this.ctx;
    const before = scene.get(id);
    if (!before || before.type !== "image" || before.assetPath !== sourcePath) return;
    scene.update(id, { assetPath });
    const after = scene.get(id) as ImageEl;
    history.push({ before: [before], after: [after] });
  }

  private setStatus(s: BackgroundStatus): void {
    this._status = s;
    if (this.disposed) return;
    for (const fn of [...this.listeners]) fn(s);
  }
}
