import type { Change } from "../model/history";
import type { Scene } from "../model/scene";
import type { StrokeEl } from "../model/types";
import type { PointerInfo, Tool, WorldPoint } from "./tool";

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
}

/** Collects points between down and up and commits them as one StrokeEl. */
export class PenTool implements Tool {
  readonly id: "pen" | "highlighter";
  private live: StrokeEl | null = null;
  private newId: () => string;
  private now: () => number;

  constructor(private ctx: PenToolContext) {
    this.id = ctx.strokeTool ?? "pen";
    this.newId = ctx.newId ?? (() => crypto.randomUUID());
    this.now = ctx.now ?? (() => Date.now());
  }

  down(p: WorldPoint, e: PointerInfo): void {
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
    this.ctx.setLive(this.live);
  }

  move(pts: WorldPoint[], e: PointerInfo): void {
    void e;
    if (!this.live || pts.length === 0) return;
    // Mutated in place: long strokes must not cost O(n) per pointer event.
    for (const p of pts) this.live.points.push(p);
    this.ctx.setLive(this.live);
  }

  up(): void {
    const stroke = this.live;
    if (!stroke) return;
    this.live = null;
    const committed: StrokeEl = { ...stroke, z: this.ctx.scene.nextZ(), updatedAt: this.now() };
    this.ctx.scene.add(committed);
    this.ctx.onCommit?.({ before: [], after: [committed] });
    this.ctx.setLive(null);
  }

  cancel(): void {
    if (!this.live) return;
    this.live = null;
    this.ctx.setLive(null);
  }
}
