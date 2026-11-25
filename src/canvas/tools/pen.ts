import { recognizeShape } from "../geometry/recognize-shape";
import type { Change } from "../model/history";
import type { Scene } from "../model/scene";
import type { Point, StrokeEl } from "../model/types";
import type { PointerInfo, Tool, WorldPoint } from "./tool";

/** Snap to shape: the pointer must stay within this many screen px... */
export const HOLD_SLOP_PX = 4;
/** ...for this long before the stroke is recognised as a shape. */
export const HOLD_MS = 500;

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemClock: Clock = {
  // Monotonic: only differences are used, and a wall-clock jump must not end or fake a hold.
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface PenToolContext {
  scene: Scene;
  /** Current colour and size; read once when a stroke starts. */
  style: () => { color: string; size: number };
  /** Shows (or clears, with null) the in-progress stroke. */
  setLive: (stroke: StrokeEl | null) => void;
  /** Called with the undo step for each committed stroke. */
  onCommit?: (c: Change) => void;
  /** Which stroke kind to produce; defaults to "pen". */
  strokeTool?: "pen" | "highlighter";
  newId?: () => string;
  now?: () => number;
  /** Snap to shape on a hold; read once when a stroke starts. Off when absent. */
  snap?: () => boolean;
  /** Camera zoom, to turn the screen-px hold slop into world units. Defaults to 1. */
  zoom?: () => number;
  /** Shows (or clears, with null) the snapped shape preview. */
  setGhost?: (ghost: StrokeEl | null) => void;
  /** Timer source for hold detection (injectable for tests). */
  clock?: Clock;
}

/** Collects points between down and up and commits them as one StrokeEl; with snap on, a hold snaps it to a shape. */
export class PenTool implements Tool {
  readonly id: "pen" | "highlighter";
  private live: StrokeEl | null = null;
  private newId: () => string;
  private now: () => number;
  private clock: Clock;
  /** Hold detection, only while snapping: where and when the pointer last moved beyond the slop. */
  private snapping = false;
  private slop = HOLD_SLOP_PX;
  private anchorX = 0;
  private anchorY = 0;
  private anchorAt = 0;
  private timer: unknown = null;
  private ghost: StrokeEl | null = null;

  constructor(private ctx: PenToolContext) {
    this.id = ctx.strokeTool ?? "pen";
    this.newId = ctx.newId ?? (() => crypto.randomUUID());
    this.now = ctx.now ?? (() => Date.now());
    this.clock = ctx.clock ?? systemClock;
  }

  down(p: WorldPoint, e: PointerInfo): void {
    this.stopHold();
    const { color, size } = this.ctx.style();
    this.live = {
      id: this.newId(),
      z: 0,
      updatedAt: 0,
      type: "stroke",
      tool: this.id,
      color,
      size,
      points: [p],
      simulatePressure: e.kind !== "pen",
    };
    // New highlighters are drawn at exactly the chosen size (legacy ones stay 3x, see strokeWidth).
    if (this.id === "highlighter") this.live.sizeMode = "px";
    this.ctx.setLive(this.live);
    this.snapping = this.ctx.snap?.() ?? false;
    if (this.snapping) {
      this.slop = HOLD_SLOP_PX / (this.ctx.zoom?.() ?? 1);
      this.anchorX = p[0];
      this.anchorY = p[1];
      this.anchorAt = this.clock.now();
      this.arm(HOLD_MS);
    }
  }

  move(pts: WorldPoint[], e: PointerInfo): void {
    void e;
    if (!this.live || pts.length === 0) return;
    // Mutated in place: long strokes must not cost O(n) per pointer event.
    for (const p of pts) this.live.points.push(p);
    if (this.snapping) this.noteMovement(pts);
    this.ctx.setLive(this.live);
  }

  up(): void {
    const stroke = this.live;
    if (!stroke) return;
    const ghost = this.ghost;
    this.live = null;
    this.stopHold();
    const committed: StrokeEl = ghost
      ? { ...ghost, z: this.ctx.scene.nextZ(), updatedAt: this.now() }
      : { ...stroke, z: this.ctx.scene.nextZ(), updatedAt: this.now() };
    this.ctx.scene.add(committed);
    this.ctx.onCommit?.({ before: [], after: [committed] });
    this.ctx.setLive(null);
  }

  cancel(): void {
    this.stopHold();
    if (!this.live) return;
    this.live = null;
    this.ctx.setLive(null);
  }

  /** No allocation per event: compares against the anchor and, on real movement, just moves it. */
  private noteMovement(pts: WorldPoint[]): void {
    let moved = false;
    const slop2 = this.slop * this.slop;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i][0] - this.anchorX;
      const dy = pts[i][1] - this.anchorY;
      if (dx * dx + dy * dy <= slop2) continue;
      this.anchorX = pts[i][0];
      this.anchorY = pts[i][1];
      moved = true;
    }
    if (!moved) return;
    this.anchorAt = this.clock.now();
    if (this.ghost) {
      this.ghost = null;
      this.ctx.setGhost?.(null);
    }
    // The pending timer re-checks the anchor time when it fires; one is armed only after a hold ended.
    if (this.timer === null) this.arm(HOLD_MS);
  }

  private arm(ms: number): void {
    this.timer = this.clock.setTimeout(this.onTimer, ms);
  }

  private onTimer = (): void => {
    this.timer = null;
    if (!this.live || !this.snapping) return;
    const still = this.clock.now() - this.anchorAt;
    if (still < HOLD_MS) {
      this.arm(HOLD_MS - still);
      return;
    }
    const live = this.live;
    const shape = recognizeShape(live.points.map((p) => [p[0], p[1]] as [number, number]));
    if (!shape) return;
    this.ghost = {
      ...live,
      points: shape.points.map(([x, y]): Point => [x, y, 0.5]),
      simulatePressure: false,
    };
    this.ctx.setGhost?.(this.ghost);
  };

  private stopHold(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.snapping = false;
    if (this.ghost) {
      this.ghost = null;
      this.ctx.setGhost?.(null);
    }
  }
}
