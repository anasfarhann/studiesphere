import { capturePreview, encodeJpeg, previewRect, type PreviewTarget } from "./page-preview";

/** At most one preview per 20 s while editing (see the plan's Global Constraints). */
export const PREVIEW_INTERVAL_MS = 20_000;
/** A change is followed by a preview no sooner than this, so a burst of strokes gives one preview. */
export const PREVIEW_DELAY_MS = 2_000;
/** The idle callback runs within this even when the main thread never goes idle. */
const IDLE_TIMEOUT_MS = 2_000;

/** Where previews go: the page's `preview.jpg`. Every call may fail; failures are ignored. */
export interface PreviewSink {
  /** Upserts the preview. `touch`: also bump the page's updated_at, so cards re-fetch it (cache-busting). */
  save(blob: Blob, opts: { touch: boolean }): Promise<void>;
  /** The page was emptied: drop its preview (cards fall back to the placeholder). */
  remove(): Promise<void>;
  /** Whether the page already has a preview. */
  exists(): Promise<boolean>;
}

export interface PagePreviewsOptions {
  target: PreviewTarget;
  sink: PreviewSink;
  /** The scene's change feed: every edit, undo and redo. */
  onChange: (fn: () => void) => () => void;
  /** Runs `cb` when the main thread is idle (requestIdleCallback where available). */
  idle?: (cb: () => void) => void;
  createCanvas?: () => HTMLCanvasElement;
  intervalMs?: number;
  delayMs?: number;
}

const defaultIdle = (cb: () => void) => {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => cb(), { timeout: IDLE_TIMEOUT_MS });
  } else {
    setTimeout(cb, 0);
  }
};

/**
 * Keeps a page's card preview up to date from the browser: off the input path (a timer, then an idle callback),
 * throttled while editing, plus once on leave when there are unsaved-to-preview edits. Never throws and never
 * reports failures: a missing or stale preview just means the card shows the placeholder or an older picture.
 */
export class PagePreviews {
  private dirty = false;
  private running = false;
  /** A run has started but not drawn yet (it is waiting for photos): a leave must draw in its place. */
  private awaitingCapture = false;
  private disposed = false;
  private last = -Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Encodes and uploads in order, so an older picture never lands after a newer one. */
  private chain: Promise<void> = Promise.resolve();
  private off: () => void = () => {};
  private idle: (cb: () => void) => void;
  private interval: number;
  private delay: number;

  constructor(private opts: PagePreviewsOptions) {
    this.idle = opts.idle ?? defaultIdle;
    this.interval = opts.intervalMs ?? PREVIEW_INTERVAL_MS;
    this.delay = opts.delayMs ?? PREVIEW_DELAY_MS;
  }

  start(): void {
    this.off = this.opts.onChange(() => this.markDirty());
    // A page with content but no preview (a copy, or older than previews): make one, without bumping the page.
    if (this.opts.target.elements().length > 0) {
      this.idle(() => {
        if (this.disposed) return;
        this.opts.sink.exists().then(
          (has) => {
            if (!has && !this.disposed && !this.dirty && !this.running) void this.generate(false);
          },
          () => {},
        );
      });
    }
  }

  /**
   * Leaving (tab hidden, unmount): when there are edits not yet in a preview, or a run has not drawn yet, draw now
   * and upload. Nothing when the last capture is merely still uploading.
   */
  flush(): void {
    if (this.disposed || !(this.dirty || this.awaitingCapture)) return;
    this.dirty = false;
    this.awaitingCapture = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.last = Date.now();
    this.captureAndSave(true);
  }

  /** Leaving the page: flush, then stop. Must run before the editor is destroyed (the drawing is synchronous). */
  dispose(): void {
    this.flush();
    this.disposed = true;
    this.off();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private markDirty(): void {
    if (this.disposed) return;
    this.dirty = true;
    this.schedule();
  }

  private schedule(): void {
    if (this.timer !== null || this.running || this.disposed) return;
    const wait = Math.max(this.delay, this.last + this.interval - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      this.idle(() => void this.fire());
    }, wait);
  }

  private async fire(): Promise<void> {
    if (this.disposed || !this.dirty) return;
    // Drawing or typing: try again shortly rather than compete with the pen (Safari has no requestIdleCallback).
    if (this.opts.target.isInteracting?.()) {
      this.schedule();
      return;
    }
    this.dirty = false;
    await this.generate(true);
  }

  private async generate(touch: boolean): Promise<void> {
    this.running = true;
    this.awaitingCapture = true;
    const prevLast = this.last;
    this.last = Date.now();
    try {
      const area = previewRect(this.opts.target);
      if (area) await this.opts.target.preloadImages?.(area).catch(() => {});
      // A leave drew in our place (or the page is gone): nothing more to do.
      if (this.disposed || !this.awaitingCapture) return;
      if (this.opts.target.isInteracting?.()) {
        // The pen came down while the photos loaded: keep the edits pending and retry.
        this.awaitingCapture = false;
        this.dirty = true;
        this.last = prevLast; // no preview was made: this does not count toward the throttle
        return;
      }
      this.awaitingCapture = false;
      this.captureAndSave(touch);
      await this.chain;
    } catch {
      // previewRect or a target method threw: no preview this time.
    } finally {
      this.awaitingCapture = false;
      this.running = false;
      if (this.dirty) this.schedule();
    }
  }

  /** Draws synchronously (the editor may be gone next tick), then queues encode and upload. */
  private captureAndSave(touch: boolean): void {
    let canvas: HTMLCanvasElement | null = null;
    let empty = false;
    try {
      empty = this.opts.target.elements().length === 0;
      canvas = empty ? null : capturePreview(this.opts.target, this.opts.createCanvas);
    } catch {
      return;
    }
    const { sink } = this.opts;
    if (empty) {
      this.chain = this.chain.then(() => sink.remove()).catch(() => {});
      return;
    }
    if (!canvas) return;
    const c = canvas;
    this.chain = this.chain
      .then(async () => {
        const blob = await encodeJpeg(c);
        if (blob) await sink.save(blob, { touch });
      })
      .catch(() => {});
  }
}
