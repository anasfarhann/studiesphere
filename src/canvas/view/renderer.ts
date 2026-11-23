import type { Scene } from "../model/scene";
import type { CanvasElement, StrokeEl } from "../model/types";
import { boundsOf, TEXT_LINE_HEIGHT } from "../model/bounds";
import { approxMeasure, wrapText, type Measure } from "../model/wrap-text";
import type { Camera } from "./camera";
import { HANDLE_DRAW_PX } from "../tools/image-resize";
import { outlineToPath, strokeOutline, type PathFactory } from "./stroke-path";

export interface RendererOptions {
  raf?: (cb: () => void) => number;
  caf?: (id: number) => void;
  createPath?: PathFactory;
  /** Resolves an asset path to a decoded image. Without it, photos stay grey placeholders. */
  loadImage?: ImageLoader;
}

export type ImageLoader = (assetPath: string) => Promise<ImageBitmap | HTMLImageElement>;
type ImageEntry = { state: "loading" } | { state: "ready"; img: ImageBitmap | HTMLImageElement } | { state: "error" };

const HIGHLIGHTER_ALPHA = 0.35;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private pending: number | null = null;
  private live: StrokeEl | null = null;
  private selection: string[] = [];
  private lasso: [number, number][] | null = null;
  private hidden: string | null = null;
  private cache = new Map<string, { updatedAt: number; path: Path2D }>();
  private maybeRemoved = false;
  private unsubscribe: () => void;
  private raf: (cb: () => void) => number;
  private caf: (id: number) => void;
  private createPath: PathFactory;
  private loadImage: ImageLoader | undefined;
  /** Decoded photos by assetPath, so each is fetched and decoded once. */
  private images = new Map<string, ImageEntry>();

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

  setSelection(ids: string[]): void {
    this.selection = ids;
    this.requestFrame();
  }

  /** An element not to draw (the text box being edited in the overlay), or null. */
  setHidden(id: string | null): void {
    this.hidden = id;
    this.requestFrame();
  }

  /** The lasso path being drawn (world coordinates), or null. */
  setLasso(points: [number, number][] | null): void {
    this.lasso = points;
    this.requestFrame();
  }

  destroy(): void {
    this.unsubscribe();
    if (this.pending !== null) {
      this.caf(this.pending);
      this.pending = null;
    }
    this.cache.clear();
    this.releaseImages(() => true);
  }

  private releaseImages(drop: (assetPath: string) => boolean): void {
    for (const [path, e] of this.images) {
      if (!drop(path)) continue;
      if (e.state === "ready" && "close" in e.img) e.img.close();
      this.images.delete(path);
    }
  }

  /** The decoded image if it is ready; starts loading it the first time it is asked for. */
  private imageFor(assetPath: string): ImageEntry {
    const hit = this.images.get(assetPath);
    if (hit) return hit;
    const load = this.loadImage;
    const loading: ImageEntry = { state: "loading" };
    if (!load) return loading;
    this.images.set(assetPath, loading);
    load(assetPath).then(
      (img) => this.settleImage(assetPath, loading, { state: "ready", img }),
      () => this.settleImage(assetPath, loading, { state: "error" }),
    );
    return loading;
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

  private draw(): void {
    const { ctx, camera, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const k = dpr * camera.zoom;
    ctx.setTransform(k, 0, 0, k, -camera.x * k, -camera.y * k);

    for (const el of this.scene.getVisible(camera.viewRect(this.cssW, this.cssH))) {
      if (el.id !== this.hidden) this.drawElement(el);
    }
    if (this.live) this.drawStroke(this.live, this.createStrokePath(this.live));
    this.drawSelection();
    this.drawLasso();
    this.prune();
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

  private drawElement(el: CanvasElement): void {
    const { ctx } = this;
    if (el.type === "stroke") {
      this.drawStroke(el, this.cachedPath(el));
    } else if (el.type === "text") {
      ctx.fillStyle = el.color;
      ctx.font = `${el.fontSize}px sans-serif`;
      ctx.textBaseline = "alphabetic";
      const measure: Measure = typeof ctx.measureText === "function" ? (str) => ctx.measureText(str).width : approxMeasure;
      const lines = wrapText(measure, el.text, el.w, el.fontSize);
      lines.forEach((line, i) => ctx.fillText(line, el.x, el.y + el.fontSize * TEXT_LINE_HEIGHT * (i + 1)));
    } else if (el.type === "image") {
      const entry = this.imageFor(el.assetPath);
      if (entry.state === "ready") ctx.drawImage(entry.img, el.x, el.y, el.w, el.h);
      else this.drawPlaceholder(el, entry.state === "error");
    } else {
      this.drawPlaceholder(el, false);
    }
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
    this.drawResizeHandle(maxX, maxY);
  }

  /** Corner grip for a single selected photo (the touch target is larger than what is drawn). */
  private drawResizeHandle(cx: number, cy: number): void {
    if (this.selection.length !== 1 || this.scene.get(this.selection[0])?.type !== "image") return;
    const { ctx, camera } = this;
    const s = HANDLE_DRAW_PX / camera.zoom;
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
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
