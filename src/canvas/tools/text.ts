import { boundsOf } from "../model/bounds";
import { AUTO_TEXT_MAX_W, autoTextWidth, measureTextBox, minTextWidth } from "../model/text-layout";
import type { History } from "../model/history";
import type { Scene } from "../model/scene";
import type { TextStyleFields } from "../model/text-style";
import type { TextEl } from "../model/types";
import { approxMeasureFor, type Measure } from "../model/wrap-text";
import type { PointerInfo, Tool, WorldPoint } from "./tool";

export const TEXT_FONT_SIZE = 18;
export const TEXT_COLOR = "#1B1A1F";

/** What the text box being edited looks like; `id` is null for a box not yet created. */
export type TextSession = TextStyleFields & {
  id: string | null;
  x: number;
  y: number;
  /** Wrap width of a fixed box; for an auto box, its width when the session opened (the overlay re-measures). */
  w: number;
  /** true for an auto-width box (every new box); false for a fixed-width or legacy one. */
  autoW: boolean;
  /** Auto boxes: how wide the editor lets the box grow at this spot (it wraps there); absent means AUTO_TEXT_MAX_W. */
  maxW?: number;
  fontSize: number;
  color: string;
  text: string;
};

/** What can be changed on a text box after it exists. */
export type TextStylePatch = TextStyleFields & { fontSize?: number; color?: string };

/** Only the style fields that differ from the plain default, so unstyled boxes stay small. */
function styleOf(s: TextStyleFields): TextStyleFields {
  const out: TextStyleFields = {};
  if (s.font) out.font = s.font;
  if (s.bold) out.bold = true;
  if (s.italic) out.italic = true;
  if (s.underline) out.underline = true;
  return out;
}

/** The overlay textarea, as the controller sees it. */
export interface TextInput {
  /** Must focus synchronously: iPad Safari only opens the keyboard from inside a user gesture. */
  focus(): void;
  value(): string;
}

export interface TextEditingContext {
  scene: Scene;
  history: History;
  /** Size, colour, font and styles for new boxes; anything missing means the default (plain box). */
  style?: () => TextStyleFields & { size?: number; color?: string };
  newId?: () => string;
  now?: () => number;
  /** Measures text in a box's font; the app passes the canvas's real measureText. Default: the approximation. */
  measure?: (style: TextStyleFields) => Measure;
  /**
   * The widest (world units) an auto box at world (x, y) may grow before it wraps, so its editor stays on screen.
   * Absent, or not finite: AUTO_TEXT_MAX_W.
   */
  maxAutoWidth?: (x: number, y: number) => number;
  /** A box's measured w/lines were just stored (commit of a new or edited box). */
  onMeasured?: (id: string) => void;
}

/** Id of the topmost text element under a world point, or null. */
export function textAt(scene: Scene, x: number, y: number): string | null {
  const hits = scene.getVisible({ minX: x, minY: y, maxX: x, maxY: y });
  for (let i = hits.length - 1; i >= 0; i--) {
    const el = hits[i];
    if (el.type !== "text") continue;
    const b = boundsOf(el);
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return el.id;
  }
  return null;
}

/** One text box being edited at a time; commit turns it into exactly one history step. */
export class TextEditing {
  private _session: TextSession | null = null;
  private input: TextInput | null = null;
  /** Latest text typed in the overlay; used if the overlay is already gone when we commit. */
  private draftText: string | null = null;
  private listeners = new Set<() => void>();
  private newId: () => string;
  private now: () => number;
  private measureFor: (style: TextStyleFields) => Measure;

  constructor(private ctx: TextEditingContext) {
    this.newId = ctx.newId ?? (() => crypto.randomUUID());
    this.now = ctx.now ?? (() => Date.now());
    this.measureFor = ctx.measure ?? approxMeasureFor;
  }

  /** Width an auto box with `text` in `style` gets (at most `maxW`, when given). */
  autoWidth(style: TextStyleFields & { fontSize: number; maxW?: number }, text: string): number {
    return autoTextWidth(this.measureFor(style), text, style.fontSize, style.maxW);
  }

  /** Measured width and line count of a box (see measureTextBox). */
  measureBox(el: TextStyleFields & { w: number; text: string; fontSize: number; autoW?: boolean; maxW?: number }): { w: number; lines: number } {
    return measureTextBox(this.measureFor(el), el);
  }

  /** The editor's cap for an auto box opened at (x, y); undefined when there is room for the full maximum. */
  private capAt(x: number, y: number): number | undefined {
    const cap = this.ctx.maxAutoWidth?.(x, y);
    return cap !== undefined && Number.isFinite(cap) && cap < AUTO_TEXT_MAX_W ? cap : undefined;
  }

  get session(): TextSession | null {
    return this._session;
  }

  /** The element to hide from the canvas while its text is in the overlay. */
  get hiddenId(): string | null {
    return this._session?.id ?? null;
  }

  bind(input: TextInput | null): void {
    this.input = input;
  }

  /** The overlay reports every edit, so an unmount cannot lose what was typed. */
  draft(text: string): void {
    if (this._session) this.draftText = text;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private open(s: TextSession): void {
    this._session = s;
    this.draftText = null;
    this.emit();
    this.input?.focus();
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }

  beginAt(x: number, y: number): void {
    this.commit();
    const style = this.ctx.style?.() ?? {};
    const fontSize = style.size ?? TEXT_FONT_SIZE;
    const maxW = this.capAt(x, y);
    this.open({
      id: null, x, y, w: minTextWidth(fontSize), autoW: true, ...(maxW !== undefined ? { maxW } : {}), fontSize,
      color: style.color ?? TEXT_COLOR, text: "", ...styleOf(style),
    });
  }

  /** Restyles the box being edited (its overlay follows). The element itself is updated by the editor. */
  restyle(patch: TextStylePatch): void {
    if (!this._session) return;
    this._session = { ...this._session, ...patch };
    this.emit();
  }

  beginEdit(id: string): boolean {
    const el = this.ctx.scene.get(id);
    if (!el || el.type !== "text") return false;
    this.commit();
    const auto = el.autoW === true;
    const maxW = auto ? this.capAt(el.x, el.y) : undefined;
    this.open({
      id, x: el.x, y: el.y, w: el.w, autoW: auto, ...(maxW !== undefined ? { maxW } : {}), fontSize: el.fontSize, color: el.color,
      text: el.text, ...styleOf(el),
    });
    return true;
  }

  /** Ends the session. `text` defaults to what is in the overlay. Safe to call when nothing is being edited. */
  commit(text?: string): void {
    const s = this._session;
    if (!s) return;
    const value = text ?? this.input?.value() ?? this.draftText ?? s.text;
    this._session = null;
    const { scene, history } = this.ctx;
    const blank = value.trim() === "";
    if (s.id === null) {
      if (!blank) {
        const id = this.newId();
        const { w, lines } = this.measureBox({ ...s, text: value });
        scene.add({
          id, z: scene.nextZ(), updatedAt: this.now(), type: "text",
          x: s.x, y: s.y, w, ...(s.autoW ? { autoW: true } : {}), ...(s.autoW && s.maxW !== undefined ? { maxW: s.maxW } : {}), lines,
          text: value, fontSize: s.fontSize, color: s.color, ...styleOf(s),
        });
        const after = scene.get(id);
        if (after) history.push({ before: [], after: [after] });
        this.ctx.onMeasured?.(id);
      }
    } else {
      const before = scene.get(s.id);
      if (before && before.type === "text") {
        if (blank) {
          scene.remove(before.id);
          history.push({ before: [before], after: [] });
        } else {
          // An auto box follows its text (wrapping where this editor did); a fixed one keeps its width and rewraps.
          // Both store their measured line count. A legacy box only gets its new text, as before.
          if (value !== before.text) {
            const patch: Partial<TextEl> = { text: value };
            if (before.autoW !== undefined) {
              const next = { ...before, text: value, maxW: before.autoW ? s.maxW : before.maxW };
              const m = this.measureBox(next);
              patch.w = m.w;
              patch.lines = m.lines;
              if (before.autoW) patch.maxW = s.maxW;
            }
            scene.update(before.id, patch);
            const after = scene.get(before.id);
            if (after) history.push({ before: [before], after: [after] });
            this.ctx.onMeasured?.(before.id);
          }
        }
      }
    }
    this.emit();
  }
}

export interface TextToolContext {
  scene: Scene;
  editing: TextEditing;
  /** Movement (world units) beyond which a press is a drag, not a tap. */
  slop: () => number;
}

/** Tap empty canvas to start a box, tap a box to edit it. Starts on pointer up so the keyboard opens from a gesture. */
export class TextTool implements Tool {
  readonly id = "text" as const;
  private start: WorldPoint | null = null;
  private moved = false;

  constructor(private ctx: TextToolContext) {}

  down(p: WorldPoint, e: PointerInfo): void {
    void e;
    this.start = p;
    this.moved = false;
  }

  move(pts: WorldPoint[], e: PointerInfo): void {
    void e;
    const s = this.start;
    if (!s) return;
    for (const p of pts) if (Math.hypot(p[0] - s[0], p[1] - s[1]) > this.ctx.slop()) this.moved = true;
  }

  up(): void {
    const s = this.start;
    this.start = null;
    if (!s || this.moved) return;
    const id = textAt(this.ctx.scene, s[0], s[1]);
    if (id) this.ctx.editing.beginEdit(id);
    else this.ctx.editing.beginAt(s[0], s[1]);
  }

  cancel(): void {
    this.start = null;
  }
}
