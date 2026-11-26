import { t } from "@/i18n/en";
import type { Scene } from "../model/scene";
import type { AudioEl, CanvasElement, FileEl, Rect, StrokeEl } from "../model/types";
import { AUDIO_ICON_R, AUDIO_ICON_X, boundsOf, CARD_H, CARD_W, FILE_ICON_SIZE, FILE_ICON_X, TEXT_LINE_HEIGHT } from "../model/bounds";
import { ellipsize, FILE_BADGE, fileKind, formatBytes, type FileKind } from "../model/file-card";
import { formatDuration } from "../model/format-duration";
import { HIGHLIGHTER_ALPHA } from "../model/stroke-style";
import { textLines } from "../model/text-layout";
import { cssFont, whenFontReady, type TextStyleFields } from "../model/text-style";
import { approxMeasure, approxMeasureFor, type Measure } from "../model/wrap-text";
import { isTaintedImage } from "../attachments/image-loader";
import type { Camera } from "./camera";
import { HANDLE_DRAW_PX } from "../tools/image-resize";
import { textHandleCenter } from "../tools/text-resize";
import { validCrop } from "../tools/image-crop";
import { outlineToPath, strokeOutline, type PathFactory } from "./stroke-path";

export interface RendererOptions {
  raf?: (cb: () => void) => number;
  caf?: (id: number) => void;
  createPath?: PathFactory;
  /** Resolves an asset path to a decoded image. Without it, photos stay grey placeholders. */
  loadImage?: ImageLoader;
  /** Called before a failed image is retried, so cached signed URLs for it can be dropped. */
  forgetImage?: (assetPath: string) => void;
  /** Estimated decoded size (w*h*4) kept in memory; least recently drawn photos are evicted beyond it. */
  imageBudgetBytes?: number;
}

/** ~96 MB of decoded pixels: a handful of 2048 px photos, safe for iPad Safari. */
export const IMAGE_BUDGET_BYTES = 96 * 1024 * 1024;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 60_000;

const BADGE_COLOR: Record<FileKind, string> = {
  pdf: "#dc2626",
  image: "#0891b2",
  audio: "#7c3aed",
  video: "#db2777",
  doc: "#2563eb",
  sheet: "#16a34a",
  slides: "#ea580c",
  other: "#64748b",
};

export type ImageLoader = (assetPath: string) => Promise<ImageBitmap | HTMLImageElement>;
type ImageEntry =
  | { state: "loading"; failures: number }
  | { state: "ready"; img: ImageBitmap | HTMLImageElement; bytes: number; lastUsed: number }
  | { state: "error"; failures: number; retryAt: number };

/** Snap-to-shape preview: the shape in the stroke colour at this alpha, plus a dashed centre line. */
const GHOST_ALPHA = 0.4;
const GHOST_DASH_PX: [number, number] = [6, 4];
const GHOST_LINE_PX = 1.5;
const GROUND_COLOR = "#FBF9F7";
const DOT_COLOR = "#DDD5CD";
const DOT_SPACING = 28;
const DOT_RADIUS_PX = 1.2;
const DOT_MIN_SCREEN_GAP = 14;
const MAX_DOTS_PER_AXIS = 140;
/** Below this zoom the dots would be a few pixels apart: skip them. */
const DOT_MIN_ZOOM = 0.35;

export interface SnapshotOptions {
  /** A plain background colour (and no dot grid), e.g. white for PDFs. */
  background?: string;
  /** Draw photos that would taint the canvas (see isTaintedImage) as labelled boxes instead. */
  skipTainted?: boolean;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private pending: number | null = null;
  private live: StrokeEl | null = null;
  /** The snapped shape preview and its path (built once when set). */
  private ghost: { el: StrokeEl; path: Path2D } | null = null;
  private selection: string[] = [];
  private lasso: [number, number][] | null = null;
  private hidden: string | null = null;
  /** A photo drawn at another rectangle, whole (crop mode shows the full source). */
  private imagePreview: { id: string; x: number; y: number; w: number; h: number } | null = null;
  private cache = new Map<string, { updatedAt: number; path: Path2D }>();
  private maybeRemoved = false;
  private unsubscribe: () => void;
  private raf: (cb: () => void) => number;
  private caf: (id: number) => void;
  private createPath: PathFactory;
  private loadImage: ImageLoader | undefined;
  /** Decoded photos by assetPath, so each is fetched and decoded once. */
  private images = new Map<string, ImageEntry>();
  /** Settles when the load in flight for an assetPath finishes (either way); see preloadImages. */
  private loads = new Map<string, Promise<void>>();
  /** Set only during drawSnapshot: a plain background (no dot grid), e.g. white for PDFs. */
  private snapshotBackground: string | null = null;
  /** Set only during drawSnapshot: photos loaded without CORS are drawn as labelled boxes (they would taint the export). */
  private snapshotSkipTainted = false;
  private frameNo = 0;
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private destroyed = false;
  private forgetImage: ((assetPath: string) => void) | undefined;
  private budget: number;
  private onWake = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    let any = false;
    for (const e of this.images.values()) {
      if (e.state === "error") {
        e.retryAt = 0;
        any = true;
      }
    }
    if (any) this.requestFrame();
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private scene: Scene,
    private camera: Camera,
    opts: RendererOptions = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.raf = opts.raf ?? ((cb) => window.requestAnimationFrame(cb));
    this.caf = opts.caf ?? ((id) => window.cancelAnimationFrame(id));
    this.createPath = opts.createPath ?? (() => new Path2D());
    this.loadImage = opts.loadImage;
    this.forgetImage = opts.forgetImage;
    this.budget = opts.imageBudgetBytes ?? IMAGE_BUDGET_BYTES;
    if (this.loadImage) {
      window.addEventListener("online", this.onWake);
      document.addEventListener("visibilitychange", this.onWake);
    }
    this.unsubscribe = scene.onChange(() => {
      this.maybeRemoved = true;
      this.requestFrame();
    });
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.requestFrame();
  }

  requestFrame(): void {
    if (this.destroyed) return;
    if (this.pending !== null) return;
    this.pending = this.raf(() => {
      this.pending = null;
      this.draw();
    });
  }

  setLive(stroke: StrokeEl | null): void {
    this.live = stroke;
    this.requestFrame();
  }

  /** The snap-to-shape preview drawn over the live stroke, or null. */
  setGhost(stroke: StrokeEl | null): void {
    if (stroke === this.ghost?.el) return;
    this.ghost = stroke ? { el: stroke, path: this.createStrokePath(stroke) } : null;
    this.requestFrame();
  }

  setSelection(ids: string[]): void {
    this.selection = ids;
    this.requestFrame();
  }

  /** An element not to draw (the text box being edited in the overlay), or null. */
  setHidden(id: string | null): void {
    this.hidden = id;
    this.requestFrame();
  }

  /** Draws photo `p.id` whole at p's rectangle (crop mode), or as it is with null. Scene untouched. */
  setImagePreview(p: { id: string; x: number; y: number; w: number; h: number } | null): void {
    this.imagePreview = p;
    this.requestFrame();
  }

  /**
   * Measures text in `style` with this canvas (the same measureText the boxes are drawn with), so a box's stored
   * width matches its drawing. Falls back to the approximation where the context cannot measure.
   */
  measureFor(style: TextStyleFields): Measure {
    const { ctx } = this;
    if (typeof ctx.measureText !== "function") return approxMeasureFor(style);
    return (str, fontSize) => {
      const prev = ctx.font;
      const font = cssFont(style, fontSize);
      this.awaitFont(font);
      ctx.font = font;
      const w = ctx.measureText(str).width;
      ctx.font = prev;
      return w;
    };
  }

  /** The lasso path being drawn (world coordinates), or null. */
  setLasso(points: [number, number][] | null): void {
    this.lasso = points;
    this.requestFrame();
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubscribe();
    if (this.pending !== null) {
      this.caf(this.pending);
      this.pending = null;
    }
    this.cache.clear();
    this.textCache.clear();
    this.fontListeners.clear();
    this.releaseImages(() => true);
    this.loads.clear();
    window.removeEventListener("online", this.onWake);
    document.removeEventListener("visibilitychange", this.onWake);
    for (const id of this.retryTimers.values()) clearTimeout(id);
    this.retryTimers.clear();
  }

  private releaseImages(drop: (assetPath: string) => boolean): void {
    for (const [path, e] of this.images) {
      if (!drop(path)) continue;
      if (e.state === "ready" && "close" in e.img) e.img.close();
      this.images.delete(path);
    }
  }

  /** The decoded image if it is ready; starts (or, after a cooldown, retries) loading. Only drawn images get here. */
  private imageFor(assetPath: string): ImageEntry {
    const hit = this.images.get(assetPath);
    if (hit?.state === "ready") {
      hit.lastUsed = this.frameNo;
      return hit;
    }
    if (hit?.state === "loading") return hit;
    const load = this.loadImage;
    if (!load) return { state: "loading", failures: 0 };
    if (hit && hit.state === "error") {
      const wait = hit.retryAt - Date.now();
      if (wait > 0) {
        // A timer that fired early must not strand the retry.
        if (!this.retryTimers.has(assetPath)) this.scheduleRetry(assetPath, wait);
        return hit;
      }
      // Re-sign: the failure may have been an expired or never-issued URL.
      this.forgetImage?.(assetPath);
    }
    const failures = hit?.failures ?? 0;
    const loading: ImageEntry = { state: "loading", failures };
    this.images.set(assetPath, loading);
    const settled = load(assetPath).then(
      (img) => {
        const bytes = Math.max(1, img.width * img.height * 4);
        this.settleImage(assetPath, loading, { state: "ready", img, bytes, lastUsed: this.frameNo });
      },
      () => {
        const n = failures + 1;
        const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (n - 1));
        // Destroyed, or the entry was dropped while loading: nothing to retry.
        if (this.destroyed || this.images.get(assetPath) !== loading) return;
        this.settleImage(assetPath, loading, { state: "error", failures: n, retryAt: Date.now() + delay });
        this.scheduleRetry(assetPath, delay);
      },
    );
    const done = settled.finally(() => {
      if (this.loads.get(assetPath) === done) this.loads.delete(assetPath);
    });
    this.loads.set(assetPath, done);
    return loading;
  }

  private scheduleRetry(assetPath: string, delay: number): void {
    const old = this.retryTimers.get(assetPath);
    if (old !== undefined) clearTimeout(old);
    const timer = setTimeout(() => {
      this.retryTimers.delete(assetPath);
      this.requestFrame();
    }, delay);
    this.retryTimers.set(assetPath, timer);
  }

  private settleImage(assetPath: string, was: ImageEntry, next: ImageEntry): void {
    // Dropped (destroyed or no longer on the page) while loading: discard the result.
    if (this.images.get(assetPath) !== was) {
      if (next.state === "ready" && "close" in next.img) next.img.close();
      return;
    }
    this.images.set(assetPath, next);
    this.requestFrame();
  }

  /** Over budget: drop least recently drawn photos, never one drawn in the current frame. */
  private evictImages(): void {
    let total = 0;
    const ready: Array<[string, Extract<ImageEntry, { state: "ready" }>]> = [];
    for (const [path, e] of this.images) {
      if (e.state !== "ready") continue;
      total += e.bytes;
      ready.push([path, e]);
    }
    if (total <= this.budget) return;
    ready.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [path, e] of ready) {
      if (total <= this.budget || e.lastUsed === this.frameNo) break;
      total -= e.bytes;
      this.releaseImages((p) => p === path);
    }
  }

  /**
   * Draws the scene (ground, dots and elements; no selection, live ink or other overlays) onto another context
   * through another camera, at w x h px and dpr 1, with this renderer's drawing code and its caches (stroke paths,
   * wrapped text, decoded photos). Synchronous; returns false once destroyed. Used for page previews.
   */
  drawSnapshot(ctx: CanvasRenderingContext2D, camera: Camera, w: number, h: number, opts?: SnapshotOptions): boolean {
    if (this.destroyed) return false;
    this.snapshotBackground = opts?.background ?? null;
    this.snapshotSkipTainted = opts?.skipTainted === true;
    const saved = { ctx: this.ctx, camera: this.camera, cssW: this.cssW, cssH: this.cssH, dpr: this.dpr };
    this.ctx = ctx;
    this.camera = camera;
    this.cssW = w;
    this.cssH = h;
    this.dpr = 1;
    try {
      this.drawScene(w, h, false);
    } finally {
      this.snapshotBackground = null;
      this.snapshotSkipTainted = false;
      this.ctx = saved.ctx;
      this.camera = saved.camera;
      this.cssW = saved.cssW;
      this.cssH = saved.cssH;
      this.dpr = saved.dpr;
    }
    return true;
  }

  /**
   * Starts loading the photos inside `area` (default: the whole page) and resolves once none of them is still
   * loading, or after `timeoutMs`. Never rejects.
   */
  async preloadImages(timeoutMs: number, area?: Rect): Promise<void> {
    if (this.destroyed || !this.loadImage) return;
    const waits: Promise<void>[] = [];
    for (const el of area ? this.scene.getVisible(area) : this.scene.all()) {
      if (el.type !== "image") continue;
      const entry = this.imageFor(el.assetPath);
      const p = this.loads.get(el.assetPath);
      if (entry.state === "loading" && p) waits.push(p);
    }
    if (waits.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.all(waits),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    clearTimeout(timer);
  }

  private draw(): void {
    if (this.destroyed) return;
    this.frameNo++;
    this.drawScene(this.canvas.width, this.canvas.height, true);
    if (this.live) this.drawStroke(this.live, this.createStrokePath(this.live));
    this.drawGhost();
    this.drawSelection();
    this.drawLasso();
    this.prune();
    this.evictImages();
  }

  /** Ground, dot grid and the elements in view; `live` skips the element being edited in the text overlay. */
  private drawScene(pxW: number, pxH: number, live: boolean): void {
    const { ctx, camera, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.snapshotBackground ?? GROUND_COLOR;
    ctx.fillRect(0, 0, pxW, pxH);

    const k = dpr * camera.zoom;
    ctx.setTransform(k, 0, 0, k, -camera.x * k, -camera.y * k);
    if (this.snapshotBackground === null) this.drawDotGrid();

    for (const el of this.scene.getVisible(camera.viewRect(this.cssW, this.cssH))) {
      if (!live || el.id !== this.hidden) this.drawElement(el, live);
    }
  }

  /** Dot grid on the ground: one path, only the visible rect, skipped when zoomed far out. */
  private drawDotGrid(): void {
    const { ctx, camera } = this;
    if (camera.zoom < DOT_MIN_ZOOM) return;
    const v = camera.viewRect(this.cssW, this.cssH);
    const r = DOT_RADIUS_PX / camera.zoom;
    // Double the step until dots are >= 14 screen px apart and at most ~MAX_DOTS_PER_AXIS per axis.
    const span = Math.max(v.maxX - v.minX, v.maxY - v.minY);
    let step = DOT_SPACING;
    while (step * camera.zoom < DOT_MIN_SCREEN_GAP || span / step > MAX_DOTS_PER_AXIS - 2) step *= 2;
    const x0 = Math.ceil((v.minX - r) / step) * step;
    const y0 = Math.ceil((v.minY - r) / step) * step;
    ctx.fillStyle = DOT_COLOR;
    ctx.beginPath();
    for (let y = y0; y <= v.maxY + r; y += step) {
      for (let x = x0; x <= v.maxX + r; x += step) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }

  private createStrokePath(el: StrokeEl): Path2D {
    return outlineToPath(strokeOutline(el), this.createPath);
  }

  /** Test/diagnostic hook: number of cached stroke paths. */
  get cachedPathCount(): number {
    return this.cache.size;
  }

  private cachedPath(el: StrokeEl): Path2D {
    const hit = this.cache.get(el.id);
    if (hit && hit.updatedAt === el.updatedAt) return hit.path;
    const path = this.createStrokePath(el);
    this.cache.set(el.id, { updatedAt: el.updatedAt, path });
    return path;
  }

  /** Drops cache entries for elements no longer in the scene. */
  private prune(): void {
    if (!this.maybeRemoved) return;
    this.maybeRemoved = false;
    for (const id of this.cache.keys()) if (!this.scene.get(id)) this.cache.delete(id);
    for (const id of this.textCache.keys()) if (!this.scene.get(id)) this.textCache.delete(id);
    if (this.images.size > 0) {
      const used = new Set<string>();
      for (const el of this.scene.all()) if (el.type === "image") used.add(el.assetPath);
      this.releaseImages((path) => !used.has(path));
    }
  }

  private drawStroke(el: StrokeEl, path: Path2D): void {
    const { ctx } = this;
    ctx.fillStyle = el.color;
    if (el.tool === "highlighter") {
      ctx.globalAlpha = HIGHLIGHTER_ALPHA;
      ctx.fill(path);
      ctx.globalAlpha = 1;
    } else {
      ctx.fill(path);
    }
  }

  /** Fonts already asked for: a face still loading is drawn in its fallback, then redrawn once it arrives. */
  private fontsAsked = new Set<string>();
  private fontListeners = new Set<() => void>();
  /** Wrapped lines per text element, valid while its updatedAt is unchanged (dropped when a face loads). */
  private textCache = new Map<string, { updatedAt: number; lines: string[] }>();

  /** Whether `font` (a CSS font shorthand) is ready to measure. True where the Font Loading API is missing. */
  fontLoaded(font: string): boolean {
    if (typeof document === "undefined" || !document.fonts || typeof document.fonts.check !== "function") return true;
    try {
      return document.fonts.check(font);
    } catch {
      return true;
    }
  }

  /** Runs `fn` whenever a font face the canvas asked for finishes loading. Returns an unsubscribe. */
  onFontReady(fn: () => void): () => void {
    this.fontListeners.add(fn);
    return () => {
      this.fontListeners.delete(fn);
    };
  }

  private awaitFont(font: string): void {
    if (this.fontsAsked.has(font)) return;
    this.fontsAsked.add(font);
    whenFontReady(font, () => {
      if (this.destroyed) return;
      this.textCache.clear();
      for (const fn of [...this.fontListeners]) fn();
      this.requestFrame();
    });
  }

  private drawElement(el: CanvasElement, live = true): void {
    const { ctx } = this;
    if (el.type === "stroke") {
      this.drawStroke(el, this.cachedPath(el));
    } else if (el.type === "text") {
      ctx.fillStyle = el.color;
      const font = cssFont(el, el.fontSize);
      ctx.font = font;
      this.awaitFont(font);
      ctx.textBaseline = "alphabetic";
      const measure: Measure = typeof ctx.measureText === "function" ? (str) => ctx.measureText(str).width : approxMeasure;
      // A legacy or resized box wraps at its stored w; an auto box at its measured width (see textLines).
      const hit = this.textCache.get(el.id);
      const lines = hit && hit.updatedAt === el.updatedAt ? hit.lines : textLines(measure, el);
      if (lines !== hit?.lines) this.textCache.set(el.id, { updatedAt: el.updatedAt, lines });
      lines.forEach((line, i) => {
        const baseline = el.y + el.fontSize * TEXT_LINE_HEIGHT * (i + 1);
        ctx.fillText(line, el.x, baseline);
        if (el.underline && line !== "") ctx.fillRect(el.x, baseline + el.fontSize * 0.1, measure(line, el.fontSize), Math.max(1, el.fontSize / 16));
      });
    } else if (el.type === "image") {
      const entry = this.imageFor(el.assetPath);
      const pv = live && this.imagePreview && this.imagePreview.id === el.id ? this.imagePreview : null;
      const crop = pv ? null : validCrop(el.crop);
      if (entry.state !== "ready") this.drawPlaceholder(el, entry.state === "error");
      else if (this.snapshotSkipTainted && isTaintedImage(entry.img)) this.drawPhotoBox(el);
      else if (pv) ctx.drawImage(entry.img, pv.x, pv.y, pv.w, pv.h);
      else if (crop) {
        const iw = entry.img.width;
        const ih = entry.img.height;
        ctx.drawImage(entry.img, crop.x * iw, crop.y * ih, crop.w * iw, crop.h * ih, el.x, el.y, el.w, el.h);
      } else ctx.drawImage(entry.img, el.x, el.y, el.w, el.h);
    } else if (el.type === "audio") {
      this.drawAudioCard(el);
    } else if (el.type === "file") {
      this.drawFileCard(el);
    } else {
      this.drawPlaceholder(el, false);
    }
  }

  /** Card shell: type badge (opened by a DOM overlay, see FileCards), file name and size. */
  private drawFileCard(el: FileEl): void {
    const { ctx } = this;
    const b = boundsOf(el);
    ctx.beginPath();
    ctx.roundRect(b.minX, b.minY, CARD_W, CARD_H, 10);
    ctx.fillStyle = "#f8fafc";
    ctx.fill();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.stroke();
    const kind = fileKind(el.mime, el.fileName);
    const cx = b.minX + FILE_ICON_X;
    const cy = b.minY + CARD_H / 2;
    const half = FILE_ICON_SIZE / 2;
    ctx.beginPath();
    ctx.roundRect(cx - half, cy - half, FILE_ICON_SIZE, FILE_ICON_SIZE, 8);
    ctx.fillStyle = BADGE_COLOR[kind];
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(FILE_BADGE[kind], cx, cy);
    ctx.textAlign = "left";
    const tx = cx + half + 10;
    const maxW = b.minX + CARD_W - 10 - tx;
    const measure = typeof ctx.measureText === "function" ? (str: string) => ctx.measureText(str).width : (str: string) => approxMeasure(str, 15);
    ctx.fillStyle = "#1e293b";
    ctx.font = "15px sans-serif";
    ctx.fillText(ellipsize(measure, el.fileName, maxW), tx, cy - 9);
    ctx.fillStyle = "#64748b";
    ctx.font = "13px sans-serif";
    ctx.fillText(formatBytes(el.bytes), tx, cy + 12);
    ctx.textBaseline = "alphabetic";
  }

  /** Card shell, play icon and duration; the real play/pause button is a DOM overlay (AudioCards). */
  private drawAudioCard(el: AudioEl): void {
    const { ctx } = this;
    const b = boundsOf(el);
    ctx.beginPath();
    ctx.roundRect(b.minX, b.minY, CARD_W, CARD_H, 10);
    ctx.fillStyle = "#f8fafc";
    ctx.fill();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.stroke();
    // Play icon area: a filled circle with a triangle, matching the overlay button's position.
    const cx = b.minX + AUDIO_ICON_X;
    const cy = b.minY + CARD_H / 2;
    ctx.beginPath();
    ctx.roundRect(cx - AUDIO_ICON_R, cy - AUDIO_ICON_R, AUDIO_ICON_R * 2, AUDIO_ICON_R * 2, AUDIO_ICON_R);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 9);
    ctx.lineTo(cx + 10, cy);
    ctx.lineTo(cx - 6, cy + 9);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.fillStyle = "#1e293b";
    ctx.font = "18px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(formatDuration(el.durationMs), b.minX + AUDIO_ICON_X + AUDIO_ICON_R + 14, cy);
    ctx.textBaseline = "alphabetic";
  }

  /** A grey box labelled "Photo": stands in for a photo that cannot be exported. */
  private drawPhotoBox(el: CanvasElement): void {
    this.drawPlaceholder(el, false);
    const { ctx } = this;
    const b = boundsOf(el);
    const size = Math.max(8, Math.min(16, (b.maxX - b.minX) / 6, (b.maxY - b.minY) / 3));
    ctx.fillStyle = "#6b7280";
    ctx.font = `${size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t("photoPlaceholder"), (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  /** A photo that is decoded and ready, for reading a pixel (eyedropper); null while loading or failed. Starts no load. */
  readyImage(assetPath: string): { img: ImageBitmap | HTMLImageElement; tainted: boolean } | null {
    const e = this.images.get(assetPath);
    return e?.state === "ready" ? { img: e.img, tainted: isTaintedImage(e.img) } : null;
  }

  /** Whether a photo inside `area` (default: the whole page) is loaded but would taint an exported canvas. */
  hasTaintedImages(area?: Rect): boolean {
    for (const el of area ? this.scene.getVisible(area) : this.scene.all()) {
      if (el.type !== "image") continue;
      const e = this.images.get(el.assetPath);
      if (e?.state === "ready" && isTaintedImage(e.img)) return true;
    }
    return false;
  }

  private drawPlaceholder(el: CanvasElement, broken: boolean): void {
    const { ctx } = this;
    const b = boundsOf(el);
    ctx.beginPath();
    ctx.roundRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY, 6);
    ctx.fillStyle = "#f1f1f1";
    ctx.fill();
    ctx.strokeStyle = "#c8c8c8";
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.stroke();
    if (!broken) return;
    // A small "x" in the middle: the picture could not be loaded.
    const r = Math.min(12 / this.camera.zoom, (b.maxX - b.minX) / 4, (b.maxY - b.minY) / 4);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r);
    ctx.lineTo(cx - r, cy + r);
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 2 / this.camera.zoom;
    ctx.stroke();
  }

  /** One dashed box around the whole selection. */
  private drawSelection(): void {
    const { ctx, camera } = this;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of this.selection) {
      const el = this.scene.get(id);
      if (!el) continue;
      const b = boundsOf(el);
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    if (minX === Infinity) return;
    ctx.save();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1 / camera.zoom;
    ctx.setLineDash([4 / camera.zoom, 3 / camera.zoom]);
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
    ctx.restore();
    this.drawResizeHandle({ minX, minY, maxX, maxY });
  }

  /**
   * Grip for a single selected photo (bottom-right corner) or text box (right edge, vertically centred).
   * The touch target is larger than what is drawn.
   */
  private drawResizeHandle(b: { minX: number; minY: number; maxX: number; maxY: number }): void {
    if (this.selection.length !== 1) return;
    const type = this.scene.get(this.selection[0])?.type;
    if (type !== "image" && type !== "text") return;
    const [cx, cy] = type === "image" ? [b.maxX, b.maxY] : textHandleCenter(b);
    const { ctx, camera } = this;
    const s = HANDLE_DRAW_PX / camera.zoom;
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
  }

  private drawGhost(): void {
    const g = this.ghost;
    if (!g) return;
    const { ctx, camera } = this;
    const pts = g.el.points;
    ctx.save();
    ctx.globalAlpha = GHOST_ALPHA;
    ctx.fillStyle = g.el.color;
    ctx.fill(g.path);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = g.el.color;
    ctx.lineWidth = GHOST_LINE_PX / camera.zoom;
    ctx.setLineDash([GHOST_DASH_PX[0] / camera.zoom, GHOST_DASH_PX[1] / camera.zoom]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.restore();
  }

  private drawLasso(): void {
    const { ctx, camera } = this;
    const pts = this.lasso;
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1 / camera.zoom;
    ctx.setLineDash([4 / camera.zoom, 3 / camera.zoom]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.restore();
  }
}
