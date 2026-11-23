import { audioExt, Recorder, RecorderError, type RecorderOptions, type RecordingResult } from "../attachments/recorder";
import { downloadBlob, recordingFileName } from "../attachments/download";
import type { OutboxEntry, RecordingOutbox } from "../attachments/recording-outbox";
import type { ElementStore } from "../persistence/store";
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
  | { kind: "notice"; message: string }
  /**
   * Finished but over the attachment limit: kept in the outbox, never uploaded, offered as a
   * download. `saved` once the user tapped "Save recording to device".
   */
  | { kind: "oversize"; message: string; saved: boolean };

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
  /** Durable holding place; recordings are written here before upload and removed once saved. */
  outbox?: RecordingOutbox;
  /** Saves the card directly when the canvas is already gone (page left mid-recording or mid-upload). */
  store?: ElementStore;
  createRecorder?: (opts: RecorderOptions) => RecorderLike;
  newId?: () => string;
  now?: () => number;
  /** Saves a blob as a file on the device; defaults to an `<a download>` link. */
  download?: (blob: Blob, fileName: string) => void;
}

/** `written` settles when the latest outbox write for the entry did (later ops wait for it). */
type Pending = { entry: OutboxEntry; written: Promise<void>; notice: string | null };

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

  /**
   * Goes quiet but never discards: a recording in progress is stopped and handed off (outbox, upload,
   * saved through the store) in the background; an upload under way finishes the same way; a failed
   * upload stays in the outbox for recovery on the next visit. Only cancel() throws audio away.
   */
  dispose(): void {
    this.disposed = true;
    this.detachHide();
    const recorder = this.recorder;
    if (recorder && this._status.kind === "recording") void this.finish(recorder, recorder.stop(), null);
    else if (recorder) {
      recorder.cancel(); // still waiting for the microphone prompt: nothing recorded yet
      this.recorder = null;
    }
    this.listeners.clear();
  }

  /** Forgets a failed recording or a notice. An oversize recording needs saveToDevice/discardOversize. */
  dismiss(): void {
    if (this.busy || this._status.kind === "recording" || this._status.kind === "oversize") return;
    this.pending = null;
    this.setStatus({ kind: "idle" });
  }

  /** Call straight from the Record tap so the microphone prompt stays inside the gesture. */
  async start(): Promise<void> {
    // An oversize recording waits for the user's decision first; it must not slip out of view.
    if (this.busy || this.disposed || this._status.kind === "oversize") return;
    this.busy = true;
    this.pending = null;
    const create = this.ctx.createRecorder ?? ((o: RecorderOptions) => new Recorder(undefined, o));
    const recorder = create({
      onAutoStop: (p, reason) =>
        void this.finish(recorder, p, reason === "size" ? t("recordingSizeLimitReached") : t("recordingLimitReached")),
    });
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

  /** Downloads the oversize recording. Its outbox copy stays until the user taps Done/Discard. */
  saveToDevice(): void {
    const pending = this.pending;
    if (this._status.kind !== "oversize" || !pending) return;
    const { entry } = pending;
    (this.ctx.download ?? downloadBlob)(entry.blob, recordingFileName(t("recordingFileName"), entry.createdAt, audioExt(entry.mime)));
    this.setStatus({ ...this._status, saved: true });
  }

  /** The user is done with the oversize recording (saved it, or chose to discard it): drop the outbox copy. */
  async discardOversize(): Promise<void> {
    const pending = this.pending;
    if (this._status.kind !== "oversize" || !pending) return;
    this.pending = null;
    this.setStatus({ kind: "idle" });
    await pending.written;
    await this.outbox((o) => o.remove(pending.entry.id));
  }

  /** Over the limit: never uploaded, never thrown away; kept in the outbox and offered as a download. */
  private async holdOversize(pending: Pending): Promise<void> {
    this.busy = false;
    this.pending = pending;
    await pending.written;
    this.setStatus({ kind: "oversize", message: t("recordingTooLarge"), saved: false });
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
    const at = this.ctx.center();
    const now = this.ctx.now ?? Date.now;
    const entry: OutboxEntry = {
      id: (this.ctx.newId ?? (() => crypto.randomUUID()))(),
      blob: res.blob,
      mime: res.mime,
      durationMs: res.durationMs,
      x: at[0] - CARD_W / 2,
      y: at[1] - CARD_H / 2,
      createdAt: now(),
    };
    // Written first and not awaited: the upload starts at once, the outbox copy is the safety net.
    const pending: Pending = { entry, written: this.outbox((o) => o.put(entry)), notice };
    // Too large to go on the wire: kept (outbox) and offered as a download, never discarded.
    if (res.blob.size > MAX_ATTACHMENT_BYTES) return this.holdOversize(pending);
    this.pending = pending;
    await this.send();
  }

  private async send(): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    const { entry } = pending;
    let assetPath = entry.assetPath;
    if (!assetPath) {
      try {
        ({ assetPath } = await this.ctx.upload(entry.blob, {
          ownerId: this.ctx.ownerId,
          pageId: this.ctx.pageId,
          ext: audioExt(entry.mime),
        }));
      } catch (e) {
        this.busy = false;
        if (e instanceof AttachmentError && e.code === "too_large") {
          await this.holdOversize(pending);
        } else {
          // The entry stays in the outbox: retry now, or recovery on the next visit.
          this.setStatus({ kind: "error", message: t("audioUploadFailed"), retryable: true });
        }
        return;
      }
      entry.assetPath = assetPath;
      pending.written = pending.written.then(() => this.outbox((o) => o.put(entry)));
    }
    this.busy = false;
    this.pending = null;
    const el = this.add(entry, assetPath);
    this.setStatus(pending.notice ? { kind: "notice", message: pending.notice } : { kind: "idle" });
    await this.persist(el, pending);
  }

  /**
   * The outbox entry goes away only once the card is saved. Mounted: the autosave also has the
   * element, but we additionally save it straight to the store, so a tab torn down within the
   * autosave delay still keeps the card. Unmounted: the store save is the only path.
   */
  private async persist(el: AudioEl, pending: Pending): Promise<void> {
    let saved = false;
    if (this.ctx.store) {
      try {
        await this.ctx.store.save(this.ctx.pageId, [el], []);
        saved = true;
      } catch {
        // Offline: the entry stays; autosave's queue or recovery on the next visit adds the card.
      }
    } else saved = !this.disposed;
    if (!saved) return;
    await pending.written;
    await this.outbox((o) => o.remove(el.id));
  }

  /** Best-effort outbox call: a broken IndexedDB must never break recording. */
  private outbox(op: (o: RecordingOutbox) => Promise<void>): Promise<void> {
    const o = this.ctx.outbox;
    if (!o) return Promise.resolve();
    try {
      return op(o).then(() => {}, () => {});
    } catch {
      return Promise.resolve();
    }
  }

  private add(entry: OutboxEntry, assetPath: string): AudioEl {
    const { scene, history } = this.ctx;
    const el: AudioEl = {
      id: entry.id,
      z: scene.nextZ(),
      updatedAt: (this.ctx.now ?? Date.now)(),
      type: "audio",
      x: entry.x,
      y: entry.y,
      assetPath,
      durationMs: entry.durationMs,
    };
    // After dispose the canvas (and its autosave) is gone: the scene must not be touched.
    if (!this.disposed) {
      scene.add(el);
      history.push({ before: [], after: [el] });
    }
    return el;
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
