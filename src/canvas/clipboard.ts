import { boundsOf } from "./model/bounds";
import type { History } from "./model/history";
import type { Scene } from "./model/scene";
import type { CanvasElement } from "./model/types";
import type { Selection } from "./selection";
import { validCrop } from "./tools/image-crop";

/** Device storage key for the canvas clipboard (shared by every page and tab on this device). */
export const CLIPBOARD_KEY = "ss.clipboard.v1";

/**
 * Elements are stored relative to their union bounds' top-left; w/h is that bounds' size. `owner` is the
 * signed-in user who copied them: another account on the same device never sees them.
 */
type Stored = { v: 1; owner: string; w: number; h: number; elements: CanvasElement[] };

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === "string";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Enough shape checking that a stored element can be indexed, drawn and saved. */
function validElement(v: unknown): v is CanvasElement {
  if (!isRecord(v) || !str(v.id) || !fin(v.z) || !fin(v.updatedAt)) return false;
  switch (v.type) {
    case "stroke":
      return (
        (v.tool === "pen" || v.tool === "highlighter") && str(v.color) && fin(v.size) && typeof v.simulatePressure === "boolean" &&
        Array.isArray(v.points) && v.points.every((p) => Array.isArray(p) && p.length === 3 && p.every(fin))
      );
    case "text":
      return fin(v.x) && fin(v.y) && fin(v.w) && fin(v.fontSize) && str(v.text) && str(v.color);
    case "image":
      return fin(v.x) && fin(v.y) && fin(v.w) && fin(v.h) && str(v.assetPath) && (v.crop === undefined || validCrop(v.crop) !== null);
    case "audio":
      return fin(v.x) && fin(v.y) && str(v.assetPath) && fin(v.durationMs);
    case "file":
      return fin(v.x) && fin(v.y) && str(v.assetPath) && str(v.fileName) && str(v.mime) && fin(v.bytes);
    default:
      return false;
  }
}

/** Parses stored JSON; anything malformed, or copied by another (or no) account, is an empty clipboard. */
function parse(raw: string | null, owner: string): Stored | null {
  if (!raw) return null;
  try {
    const d: unknown = JSON.parse(raw);
    if (!isRecord(d) || d.v !== 1 || d.owner !== owner || !fin(d.w) || !fin(d.h) || !Array.isArray(d.elements)) return null;
    if (!d.elements.every(validElement)) return null;
    return { v: 1, owner, w: d.w, h: d.h, elements: d.elements };
  } catch {
    return null;
  }
}

/** Removes the device clipboard (before sign-out). Never throws. */
export function clearDeviceClipboard(storage?: Pick<Storage, "removeItem">): void {
  try {
    (storage ?? defaultStorage())?.removeItem(CLIPBOARD_KEY);
  } catch {
    // Storage unavailable: nothing was stored.
  }
}

function shift(el: CanvasElement, dx: number, dy: number): CanvasElement {
  if (el.type === "stroke") return { ...el, points: el.points.map(([x, y, p]) => [x + dx, y + dy, p]) };
  return { ...el, x: el.x + dx, y: el.y + dy };
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Copied canvas elements, kept in memory and in device storage so they survive a reload and reach
 * other pages and tabs. Scoped to `owner` (the signed-in user id); without one, nothing touches
 * storage and the clipboard lives in memory only. Every storage access is guarded; failures fall back to memory.
 */
export class Clipboard {
  private memory: Stored | null = null;
  /** The last copy could not be written: storage is stale, memory wins. */
  private memoryOnly = false;
  private storage: Storage | undefined;
  private owner: string;
  /** The last raw string read from storage and what it parsed to, so repeated reads (isEmpty) are cheap. */
  private cache: { raw: string; data: Stored | null } | null = null;

  constructor(opts?: { owner?: string | null; storage?: Storage }) {
    this.owner = opts?.owner ?? "";
    this.storage = this.owner ? (opts?.storage ?? defaultStorage()) : undefined;
    this.memory = this.current();
  }

  private parseCached(raw: string): Stored | null {
    if (this.cache?.raw !== raw) this.cache = { raw, data: parse(raw, this.owner) };
    return this.cache.data;
  }

  private current(): Stored | null {
    if (this.memoryOnly || !this.storage) return this.memory;
    try {
      const raw = this.storage.getItem(CLIPBOARD_KEY);
      return raw === null ? this.memory : this.parseCached(raw);
    } catch {
      return this.memory;
    }
  }

  get isEmpty(): boolean {
    return (this.current()?.elements.length ?? 0) === 0;
  }

  /** Stores deep copies of `elements`, normalised so their union bounds start at (0, 0). */
  copy(elements: CanvasElement[]): void {
    if (elements.length === 0) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of elements) {
      const b = boundsOf(el);
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    const sorted = [...elements].sort((a, b) => a.z - b.z);
    const data: Stored = { v: 1, owner: this.owner, w: maxX - minX, h: maxY - minY, elements: sorted.map((el) => shift(structuredClone(el), -minX, -minY)) };
    this.memory = data;
    try {
      if (!this.storage) return;
      const raw = JSON.stringify(data);
      this.storage.setItem(CLIPBOARD_KEY, raw);
      this.cache = { raw, data };
      this.memoryOnly = false;
    } catch {
      // Private mode or quota (a big selection of strokes): this tab still has it.
      this.memoryOnly = true;
    }
  }

  /** The stored elements (relative to (0, 0)), by z. Fresh copies. */
  items(): CanvasElement[] {
    return structuredClone(this.current()?.elements ?? []);
  }

  /** Size of the stored elements' union bounds. */
  size(): { w: number; h: number } {
    const c = this.current();
    return { w: c?.w ?? 0, h: c?.h ?? 0 };
  }
}

export interface PasteContext {
  scene: Scene;
  history: History;
  selection: Selection;
  newId?: () => string;
  now?: () => number;
}

/**
 * Inserts the clipboard's elements with new ids, above everything, so their bounds centre lands at
 * `at`, as one undo step, and selects them. Image, file and audio copies share the original assetPath.
 * Returns the new ids (empty when the clipboard is).
 */
export function pasteInto(ctx: PasteContext, clip: Clipboard, at: [number, number]): string[] {
  const items = clip.items();
  if (items.length === 0) return [];
  const { w, h } = clip.size();
  const newId = ctx.newId ?? (() => crypto.randomUUID());
  const now = (ctx.now ?? Date.now)();
  const dx = at[0] - w / 2;
  const dy = at[1] - h / 2;
  const z0 = ctx.scene.nextZ();
  const added: CanvasElement[] = [];
  ctx.scene.batch(() => {
    items.forEach((item, i) => {
      const el = { ...shift(item, dx, dy), id: newId(), z: z0 + i, updatedAt: now } as CanvasElement;
      ctx.scene.add(el);
      const stored = ctx.scene.get(el.id);
      if (stored) added.push(stored);
    });
  });
  if (added.length === 0) return [];
  ctx.history.push({ before: [], after: added });
  const ids = added.map((e) => e.id);
  ctx.selection.set(ids);
  return ids;
}
