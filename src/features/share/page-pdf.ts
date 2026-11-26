import type { SupabaseClient } from "@supabase/supabase-js";
import { boundsOf } from "@/canvas/model/bounds";
import type { CanvasElement, Rect } from "@/canvas/model/types";
import type { PreviewTarget } from "@/canvas/preview/page-preview";
import type { SnapshotOptions } from "@/canvas/view/renderer";
import { Camera } from "@/canvas/view/camera";
import type { Database } from "@/lib/supabase/types";

/*
 * Share as PDF. The page is drawn by the canvas renderer's own drawing code (strokes, text, photos, and the
 * labelled file/audio cards), offscreen onto white, rasterised per PDF page, and embedded in a jsPDF document.
 * jsPDF is imported lazily so it never lands in an initial chunk.
 *
 * Layout: A4, portrait unless the content is wider than tall (then landscape), 28 pt margins. Content that fits
 * is scaled to fit one page. Content so tall that fitting it would shrink it below MIN_FIT_RATIO of the
 * width-fit scale (unreadable) is instead fitted to the page width and sliced vertically into several pages, at
 * most MAX_PDF_PAGES (beyond that it shrinks).
 *
 * Memory (iPad Safari caps total canvas memory): one raster at a time, at most RASTER_PX_PER_PT (3 px per pt, about
 * 216 dpi) and RASTER_MAX_SIDE px per side, zeroed right after encoding.
 */

export const A4_W_PT = 595.28;
export const A4_H_PT = 841.89;
export const PDF_MARGIN_PT = 28;
/** World-unit margin around the content's bounding box. */
export const CONTENT_MARGIN = 24;
/** Below this fraction of the width-fit scale a single page would be unreadable: slice instead. */
export const MIN_FIT_RATIO = 0.5;
export const MAX_PDF_PAGES = 40;
export const RASTER_PX_PER_PT = 3;
export const RASTER_MAX_SIDE = 4096;
export const JPEG_QUALITY = 0.9;
/** Photos are waited for at most this long in total (then drawn as grey boxes, like the canvas does). */
export const PHOTO_DEADLINE_MS = 20_000;

export type PdfErrorCode = "empty" | "render" | "build";
export class PdfError extends Error {
  constructor(
    public code: PdfErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "PdfError";
  }
}

export interface PdfSlice {
  /** The world rectangle drawn on this PDF page. */
  world: Rect;
  /** Where it goes on the PDF page, in pt. */
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PdfPlan {
  orientation: "portrait" | "landscape";
  pageW: number;
  pageH: number;
  slices: PdfSlice[];
}

/** Lays the content's world bounds out on A4 pages (see the file comment). */
export function planPages(bounds: Rect): PdfPlan {
  const world: Rect = {
    minX: bounds.minX - CONTENT_MARGIN,
    minY: bounds.minY - CONTENT_MARGIN,
    maxX: bounds.maxX + CONTENT_MARGIN,
    maxY: bounds.maxY + CONTENT_MARGIN,
  };
  const bw = world.maxX - world.minX;
  const bh = world.maxY - world.minY;
  const landscape = bw > bh;
  const pageW = landscape ? A4_H_PT : A4_W_PT;
  const pageH = landscape ? A4_W_PT : A4_H_PT;
  const areaW = pageW - 2 * PDF_MARGIN_PT;
  const areaH = pageH - 2 * PDF_MARGIN_PT;
  const sWidth = areaW / bw;
  const sFit = Math.min(sWidth, areaH / bh);
  const orientation = landscape ? "landscape" : "portrait";
  if (sFit >= sWidth * MIN_FIT_RATIO) {
    const w = bw * sFit;
    const h = bh * sFit;
    return { orientation, pageW, pageH, slices: [{ world, x: PDF_MARGIN_PT + (areaW - w) / 2, y: PDF_MARGIN_PT, w, h }] };
  }
  // Fit the width, slice vertically; past the cap the scale shrinks so the page count stays bounded.
  const count = Math.min(MAX_PDF_PAGES, Math.ceil((bh * sWidth) / areaH));
  const scale = Math.min(sWidth, (areaH * count) / bh);
  const sliceH = areaH / scale;
  const w = bw * scale;
  const slices: PdfSlice[] = [];
  for (let i = 0; i < count; i++) {
    const minY = world.minY + i * sliceH;
    const maxY = i === count - 1 ? world.maxY : minY + sliceH;
    slices.push({ world: { minX: world.minX, maxX: world.maxX, minY, maxY }, x: PDF_MARGIN_PT + (areaW - w) / 2, y: PDF_MARGIN_PT, w, h: (maxY - minY) * scale });
  }
  return { orientation, pageW, pageH, slices };
}

/** `<title>.pdf` without characters that file systems or share sheets reject. */
export function pdfFileName(title: string): string {
  const base =
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "Untitled";
  return `${base}.pdf`;
}

type JsPdfModule = { jsPDF: typeof import("jspdf").jsPDF };
export interface BuildOptions {
  loadJsPdf?: () => Promise<JsPdfModule>;
  createCanvas?: () => HTMLCanvasElement;
}
/** What a PDF is drawn from: a preview target (live editor or offscreen renderer) that can be released. */
export type PdfTarget = PreviewTarget & { destroy?: () => void };

/** Renders the page to a PDF blob. Throws PdfError("empty" | "render" | "build"). */
export async function buildPagePdf(target: PdfTarget, opts: BuildOptions = {}): Promise<Blob> {
  const els = target.elements();
  if (els.length === 0) throw new PdfError("empty");
  const bounds = els.map(boundsOf).reduce<Rect>(
    (a, b) => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  if (![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)) throw new PdfError("empty");
  const plan = planPages(bounds);
  const create = opts.createCanvas ?? (() => document.createElement("canvas"));
  let doc: InstanceType<JsPdfModule["jsPDF"]>;
  try {
    const { jsPDF } = await (opts.loadJsPdf ?? (() => import("jspdf")))();
    doc = new jsPDF({ orientation: plan.orientation, unit: "pt", format: "a4", compress: true });
  } catch (e) {
    throw new PdfError("build", e instanceof Error ? e.message : String(e));
  }
  // One deadline for all photo waits. The whole page is requested up front (a 1 px draw starts every load), so the
  // photos load in parallel rather than one PDF page at a time.
  const deadline = Date.now() + PHOTO_DEADLINE_MS;
  const waitPhotos = async (area: Rect) => {
    if (!target.preloadImages) return;
    const left = deadline - Date.now();
    if (left <= 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([target.preloadImages(area).catch(() => {}), new Promise<void>((res) => (timer = setTimeout(res, left)))]);
    clearTimeout(timer);
  };
  try {
    const probe = create();
    probe.width = 1;
    probe.height = 1;
    const pctx = probe.getContext("2d");
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
    if (pctx) target.drawSnapshot(pctx, new Camera(bounds.minX, bounds.minY, 1 / span), 1, 1, { skipTainted: true });
    probe.width = 0;
    probe.height = 0;
    await waitPhotos(bounds);
  } catch {
    // Best effort: the per-page draws below wait again for whatever is still loading.
  }
  for (let i = 0; i < plan.slices.length; i++) {
    const s = plan.slices[i];
    const k = Math.min(RASTER_PX_PER_PT, RASTER_MAX_SIDE / Math.max(s.w, s.h));
    const canvas = create();
    canvas.width = Math.max(1, Math.round(s.w * k));
    canvas.height = Math.max(1, Math.round(s.h * k));
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new PdfError("render", "no 2d context");
      // World units per canvas pixel: the slice's world size over its raster size.
      const camera = new Camera(s.world.minX, s.world.minY, canvas.width / (s.world.maxX - s.world.minX));
      const draw = () => target.drawSnapshot(ctx, camera, canvas.width, canvas.height, { background: "#ffffff", skipTainted: true });
      if (!draw()) throw new PdfError("render", "renderer unavailable");
      // The first draw started loading the photos; wait for them and draw again so they show.
      await waitPhotos(s.world);
      if (!draw()) throw new PdfError("render", "renderer unavailable");
      const data = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      if (i > 0) doc.addPage("a4", plan.orientation);
      doc.addImage(data, "JPEG", s.x, s.y, s.w, s.h);
    } catch (e) {
      throw e instanceof PdfError ? e : new PdfError("build", e instanceof Error ? e.message : String(e));
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  return doc.output("blob");
}

/** "needs-tap": the browser wants a fresh tap for the share sheet (iOS drops the gesture during the async build). */
export type DeliverResult = "shared" | "downloaded" | "cancelled" | "needs-tap";
export interface DeliverOptions {
  nav?: Navigator;
  download?: (blob: Blob, fileName: string) => void;
  /** Called from a fresh tap: no "needs-tap" outcome, a refused share goes straight to the download. */
  fromTap?: boolean;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The share sheet where files can be shared (iPad), otherwise a download. A dismissed sheet is "cancelled". After a
 * long async build the tap may no longer count as a user gesture (iOS): then, or when share() is refused with
 * NotAllowedError, the result is "needs-tap" and the caller shows a Share button that calls this again with
 * `fromTap` (navigator.share is reached synchronously, before any await). Download is the final fallback.
 */
export async function deliverPdf(blob: Blob, title: string, opts: DeliverOptions = {}): Promise<DeliverResult> {
  const nav = opts.nav ?? (typeof navigator === "undefined" ? undefined : navigator);
  const download = opts.download ?? downloadBlob;
  const name = pdfFileName(title);
  if (nav && typeof nav.share === "function" && typeof nav.canShare === "function") {
    const file = new File([blob], name, { type: "application/pdf" });
    let can = false;
    try {
      can = nav.canShare({ files: [file] });
    } catch {
      can = false;
    }
    if (can) {
      if (!opts.fromTap && nav.userActivation && !nav.userActivation.isActive) return "needs-tap";
      try {
        await nav.share({ files: [file], title: name.replace(/\.pdf$/, "") });
        return "shared";
      } catch (e) {
        const n = e instanceof Error ? e.name : "";
        if (n === "AbortError") return "cancelled";
        if (n === "NotAllowedError" && !opts.fromTap) return "needs-tap";
        // Any other share failure: fall through to a plain download.
      }
    }
  }
  download(blob, name);
  return "downloaded";
}

export interface SharePdfOptions {
  title: string;
  /** Resolves the thing to draw (the live editor, or an offscreen renderer from loadPageTarget). */
  target: () => Promise<PdfTarget>;
  build?: BuildOptions;
  deliver?: (blob: Blob, title: string) => Promise<DeliverResult>;
}

/**
 * Builds and delivers the PDF; a target with `destroy` is released afterwards (a live editor has none). The blob is
 * returned too, so a "needs-tap" result can be shared from the next tap. Throws PdfError (or the target's error).
 */
export async function sharePagePdf(o: SharePdfOptions): Promise<{ result: DeliverResult; blob: Blob }> {
  const target = await o.target();
  let blob: Blob;
  try {
    blob = await buildPagePdf(target, o.build);
  } finally {
    target.destroy?.();
  }
  return { result: await (o.deliver ?? ((b, t) => deliverPdf(b, t)))(blob, o.title), blob };
}

/**
 * Loads a page from outside the canvas (the dashboard): its elements through the browser Supabase client (RLS
 * scopes them to the owner), mapped with the canvas's own row mapping, drawn by an offscreen Renderer whose photos
 * come through signed URLs. Call `destroy()` when done.
 */
export async function loadPageTarget(client: SupabaseClient<Database>, pageId: string): Promise<PdfTarget> {
  const [{ SupabaseElementStore }, { Scene }, { Renderer }, { createImageLoader }, { AttachmentService, supabaseAttachmentStorage }] = await Promise.all([
    import("@/canvas/persistence/supabase-store"),
    import("@/canvas/model/scene"),
    import("@/canvas/view/renderer"),
    import("@/canvas/attachments/image-loader"),
    import("@/canvas/attachments/upload"),
  ]);
  let elements: CanvasElement[];
  try {
    elements = await new SupabaseElementStore(client).load(pageId);
  } catch (e) {
    throw new PdfError("build", e instanceof Error ? e.message : String(e));
  }
  const scene = new Scene(elements);
  const service = new AttachmentService(supabaseAttachmentStorage(client));
  const renderer = new Renderer(document.createElement("canvas"), scene, new Camera(), {
    loadImage: createImageLoader((path) => service.signedUrl(path)),
    forgetImage: (path) => service.forgetSignedUrl(path),
  });
  return {
    elements: () => scene.all(),
    drawSnapshot: (ctx, camera, w, h, o?: SnapshotOptions) => renderer.drawSnapshot(ctx, camera, w, h, o),
    hasTaintedImages: (area) => renderer.hasTaintedImages(area),
    preloadImages: (area) => renderer.preloadImages(PHOTO_DEADLINE_MS, area),
    destroy: () => renderer.destroy(),
  };
}
