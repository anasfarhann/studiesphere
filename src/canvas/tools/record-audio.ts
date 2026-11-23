import { audioExt, Recorder, RecorderError, type RecorderOptions, type RecordingResult } from "../attachments/recorder";
import { AttachmentError, MAX_ATTACHMENT_BYTES, type UploadOptions } from "../attachments/upload";
import type { History } from "../model/history";
import { CARD_H, CARD_W } from "../model/bounds";
import type { Scene } from "../model/scene";
import type { AudioEl } from "../model/types";
import { t } from "@/i18n/en";

export type AudioStatus =
  | { kind: "idle" }
  | { kind: "recording"; startedAt: number }
  | { kind: "uploading" }
  | { kind: "error"; message: string; retryable: boolean }
  /** A saved recording that ended on its own (time limit, page hidden). */
  | { kind: "notice"; message: string };

export interface RecorderLike {
  start(): Promise<void>;
  stop(): Promise<RecordingResult>;
  cancel(): void;
}

export interface AudioRecorderContext {
  scene: Scene;
  history: History;
  ownerId: string;
  pageId: string;
  center: () => [number, number];
  upload: (file: Blob, opts: UploadOptions) => Promise<{ assetPath: string }>;
  createRecorder?: (opts: RecorderOptions) => RecorderLike;
  newId?: () => string;
  now?: () => number;
}

type Pending = { result: RecordingResult; at: [number, number]; notice: string | null };

function startMessage(e: unknown): string {
  if (e instanceof RecorderError) {
    if (e.code === "permission_denied") return t("micPermissionDenied");
    if (e.code === "recording_unsupported") return t("recordingUnsupported");
  }
  return t("recordingFailed");
}

/**
 * Record, then upload, and only then add the card (one undo step), like photos. A failed upload
 * adds nothing and keeps the recording so retry() re-sends the very same bytes.
 */
export class AudioRecorder {
  private _status: AudioStatus = { kind: "idle" };
  private listeners = new Set<(s: AudioStatus) => void>();
  private recorder: RecorderLike | null = null;
  private pending: Pending | null = null;
  private busy = false;
  private disposed = false;

  constructor(private ctx: AudioRecorderContext) {}

  get status(): AudioStatus {
    return this._status;
  }

  onStatus(fn: (s: AudioStatus) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Cancels a recording in progress (nothing is saved) and goes quiet. */
  dispose(): void {
    this.disposed = true;
    this.detachHide();
    this.recorder?.cancel();
    this.recorder = null;
    this.listeners.clear();
  }

  /** Forgets a failed recording or a notice. */
  dismiss(): void {
    if (this.busy || this._status.kind === "recording") return;
    this.pending = null;
    this.setStatus({ kind: "idle" });
  }

  /** Call straight from the Record tap so the microphone prompt stays inside the gesture. */
  async start(): Promise<void> {
    if (this.busy || this.disposed) return;
    this.busy = true;
    this.pending = null;
    const create = this.ctx.createRecorder ?? ((o: RecorderOptions) => new Recorder(undefined, o));
    const recorder = create({ onAutoStop: (p) => void this.finish(recorder, p, t("recordingLimitReached")) });
    this.recorder = recorder;
    try {
      await recorder.start();
    } catch (e) {
      this.recorder = null;
      this.busy = false;
      if (this.disposed || (e instanceof RecorderError && e.code === "cancelled")) return;
      this.setStatus({ kind: "error", message: startMessage(e), retryable: false });
      return;
    }
    if (this.disposed) {
      recorder.cancel();
      return;
    }
    this.attachHide();
    this.setStatus({ kind: "recording", startedAt: (this.ctx.now ?? Date.now)() });
  }

  async stop(): Promise<void> {
    const recorder = this.recorder;
    if (!recorder || this._status.kind !== "recording") return;
    await this.finish(recorder, recorder.stop(), null);
  }

  cancel(): void {
    if (this._status.kind !== "recording") return;
    this.detachHide();
    this.recorder?.cancel();
    this.recorder = null;
    this.busy = false;
    this.setStatus({ kind: "idle" });
  }

  async retry(): Promise<void> {
    if (this.busy || this.disposed || !this.pending || this._status.kind !== "error" || !this._status.retryable) return;
    this.busy = true;
    this.setStatus({ kind: "uploading" });
    await this.send();
  }

  private async finish(recorder: RecorderLike, result: Promise<RecordingResult>, notice: string | null): Promise<void> {
    if (this.recorder !== recorder) return;
    this.recorder = null;
    this.detachHide();
    this.setStatus({ kind: "uploading" });
    let res: RecordingResult;
    try {
      res = await result;
    } catch {
      this.busy = false;
      this.setStatus({ kind: "error", message: t("recordingFailed"), retryable: false });
      return;
    }
    // Refuse here so a too-large recording never goes on the wire; nothing is offered silently.
    if (res.blob.size > MAX_ATTACHMENT_BYTES) {
      this.busy = false;
      this.setStatus({ kind: "error", message: t("attachmentTooLarge"), retryable: false });
      return;
    }
    this.pending = { result: res, at: this.ctx.center(), notice };
    await this.send();
  }

  private async send(): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    try {
      const { assetPath } = await this.ctx.upload(pending.result.blob, {
        ownerId: this.ctx.ownerId,
        pageId: this.ctx.pageId,
        ext: audioExt(pending.result.mime),
      });
      this.busy = false;
      this.pending = null;
      if (this.disposed) return;
      this.add(pending, assetPath);
      this.setStatus(pending.notice ? { kind: "notice", message: pending.notice } : { kind: "idle" });
    } catch (e) {
      this.busy = false;
      if (e instanceof AttachmentError && e.code === "too_large") {
        this.pending = null;
        this.setStatus({ kind: "error", message: e.message, retryable: false });
      } else {
        this.setStatus({ kind: "error", message: t("audioUploadFailed"), retryable: true });
      }
    }
  }

  private add(p: Pending, assetPath: string): void {
    const { scene, history } = this.ctx;
    const el: AudioEl = {
      id: (this.ctx.newId ?? (() => crypto.randomUUID()))(),
      z: scene.nextZ(),
      updatedAt: (this.ctx.now ?? Date.now)(),
      type: "audio",
      x: p.at[0] - CARD_W / 2,
      y: p.at[1] - CARD_H / 2,
      assetPath,
      durationMs: p.result.durationMs,
    };
    scene.add(el);
    history.push({ before: [], after: [el] });
  }

  /** Leaving the page (tab hidden, closed) stops the recording and saves what was captured. */
  private onHide = (e: Event): void => {
    if (e.type !== "pagehide" && document.visibilityState !== "hidden") return;
    const recorder = this.recorder;
    if (!recorder || this._status.kind !== "recording") return;
    void this.finish(recorder, recorder.stop(), t("recordingStoppedHidden"));
  };

  private attachHide(): void {
    document.addEventListener("visibilitychange", this.onHide);
    window.addEventListener("pagehide", this.onHide);
  }

  private detachHide(): void {
    document.removeEventListener("visibilitychange", this.onHide);
    window.removeEventListener("pagehide", this.onHide);
  }

  private setStatus(s: AudioStatus): void {
    this._status = s;
    if (this.disposed) return;
    for (const fn of [...this.listeners]) fn(s);
  }
}
