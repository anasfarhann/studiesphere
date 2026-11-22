import { boundsOf } from "../model/bounds";
import type { History } from "../model/history";
import type { Scene } from "../model/scene";
import type { TextEl } from "../model/types";
import type { PointerInfo, Tool, WorldPoint } from "./tool";

export const TEXT_FONT_SIZE = 18;
export const TEXT_WIDTH = 320;

/** What the text box being edited looks like; `id` is null for a box not yet created. */
export type TextSession = {
  id: string | null;
  x: number;
  y: number;
  w: number;
  fontSize: number;
  color: string;
  text: string;
};

/** The overlay textarea, as the controller sees it. */
export interface TextInput {
  /** Must focus synchronously: iPad Safari only opens the keyboard from inside a user gesture. */
  focus(): void;
  value(): string;
}

export interface TextEditingContext {
  scene: Scene;
  history: History;
  /** Colour for new boxes. */
  color: () => string;
  newId?: () => string;
  now?: () => number;
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
  private listeners = new Set<() => void>();
  private newId: () => string;
  private now: () => number;

  constructor(private ctx: TextEditingContext) {
    this.newId = ctx.newId ?? (() => crypto.randomUUID());
    this.now = ctx.now ?? (() => Date.now());
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

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private open(s: TextSession): void {
    this._session = s;
    this.emit();
    this.input?.focus();
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn();
  }

  beginAt(x: number, y: number): void {
    this.commit();
    this.open({ id: null, x, y, w: TEXT_WIDTH, fontSize: TEXT_FONT_SIZE, color: this.ctx.color(), text: "" });
  }

  beginEdit(id: string): boolean {
    const el = this.ctx.scene.get(id);
    if (!el || el.type !== "text") return false;
    this.commit();
    this.open({ id, x: el.x, y: el.y, w: el.w, fontSize: el.fontSize, color: el.color, text: el.text });
    return true;
  }

  /** Ends the session. `text` defaults to what is in the overlay. Safe to call when nothing is being edited. */
  commit(text?: string): void {
    const s = this._session;
    if (!s) return;
    const value = text ?? this.input?.value() ?? s.text;
    this._session = null;
    const { scene, history } = this.ctx;
    const blank = value.trim() === "";
    if (s.id === null) {
      if (!blank) {
        const id = this.newId();
        scene.add({
          id, z: scene.nextZ(), updatedAt: this.now(), type: "text",
          x: s.x, y: s.y, w: s.w, text: value, fontSize: s.fontSize, color: s.color,
        });
        const after = scene.get(id);
        if (after) history.push({ before: [], after: [after] });
      }
    } else {
      const before = scene.get(s.id);
      if (before && before.type === "text") {
        if (blank) {
          scene.remove(before.id);
          history.push({ before: [before], after: [] });
        } else if (value !== before.text) {
          scene.update(before.id, { text: value } satisfies Partial<TextEl>);
          const after = scene.get(before.id);
          if (after) history.push({ before: [before], after: [after] });
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
