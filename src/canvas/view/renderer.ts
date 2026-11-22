import type { Scene } from "../model/scene";
import type { CanvasElement, StrokeEl } from "../model/types";
import { boundsOf } from "../model/bounds";
import type { Camera } from "./camera";
import { outlineToPath, strokeOutline, type PathFactory } from "./stroke-path";

export interface RendererOptions {
  raf?: (cb: () => void) => number;
  caf?: (id: number) => void;
  createPath?: PathFactory;
}

const HIGHLIGHTER_ALPHA = 0.35;
const LINE_HEIGHT = 1.4;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private pending: number | null = null;
  private live: StrokeEl | null = null;
  private selection: string[] = [];
  private lasso: [number, number][] | null = null;
  private cache = new Map<string, { updatedAt: number; path: Path2D }>();
  private maybeRemoved = false;
  private unsubscribe: () => void;
  private raf: (cb: () => void) => number;
  private caf: (id: number) => void;
  private createPath: PathFactory;

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
  }

  private draw(): void {
    const { ctx, camera, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const k = dpr * camera.zoom;
    ctx.setTransform(k, 0, 0, k, -camera.x * k, -camera.y * k);

    for (const el of this.scene.getVisible(camera.viewRect(this.cssW, this.cssH))) this.drawElement(el);
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
      el.text.split("\n").forEach((line, i) => ctx.fillText(line, el.x, el.y + el.fontSize * LINE_HEIGHT * (i + 1)));
    } else {
      const b = boundsOf(el);
      ctx.beginPath();
      ctx.roundRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY, 6);
      ctx.fillStyle = "#f1f1f1";
      ctx.fill();
      ctx.strokeStyle = "#c8c8c8";
      ctx.lineWidth = 1 / this.camera.zoom;
      ctx.stroke();
    }
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
