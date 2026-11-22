import { pinchUpdate } from "./input/pinch";
import { InputRouter, type InputKind } from "./input/router";
import { wheelAction } from "./input/wheel";
import { History } from "./model/history";
import { Scene } from "./model/scene";
import type { Change } from "./model/history";
import type { CanvasElement, StrokeEl } from "./model/types";
import { EraserTool } from "./tools/eraser";
import { HighlighterTool } from "./tools/highlighter";
import { PenTool } from "./tools/pen";
import type { PointerInfo, Tool, ToolId, WorldPoint } from "./tools/tool";
import { Camera } from "./view/camera";
import { Renderer, type RendererOptions } from "./view/renderer";

export interface EditorOptions {
  elements: CanvasElement[];
  /** Test seams for the renderer (raf, path factory). */
  renderer?: RendererOptions;
}

type Active = { kind: InputKind; mode: "draw" | "pan" | "ignore"; lastX: number; lastY: number };

/** A two-finger tap: both fingers down and up within this long, barely moving. */
const TAP_MAX_MS = 250;
const TAP_MAX_MOVE = 10;
/** Eraser radius in screen pixels (converted to world units by the zoom). */
const ERASER_SCREEN_RADIUS = 10;

type Tap = { t0: number; ids: [number, number]; up: number; moved: number; zoom0: number };

const DEFAULT_COLOR = "#111827";
const DEFAULT_SIZE = 4;

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

class HandTool implements Tool {
  readonly id = "hand" as const;
  down(): void {}
  move(): void {}
  up(): void {}
  cancel(): void {}
}

function isInputKind(t: string): t is InputKind {
  return t === "pen" || t === "touch" || t === "mouse";
}

/** Wires scene, camera, renderer, input router and tools to a canvas element. */
export class Editor {
  readonly scene: Scene;
  readonly camera = new Camera();
  readonly router = new InputRouter();
  readonly history = new History();
  private renderer: Renderer;
  private tools: Partial<Record<ToolId, Tool>>;
  private toolId: ToolId = "pen";
  private color = DEFAULT_COLOR;
  private size = DEFAULT_SIZE;
  /** Every pointer currently down on the canvas, by pointerId. */
  private pointers = new Map<number, Active>();
  /** The pointer feeding the current tool, if any. */
  private drawing: { id: number; kind: InputKind; tool: Tool } | null = null;
  private tap: Tap | null = null;
  private spaceDown = false;
  private destroyed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: EditorOptions,
  ) {
    this.scene = new Scene(opts.elements);
    this.renderer = new Renderer(canvas, this.scene, this.camera, opts.renderer);
    const stroke = {
      scene: this.scene,
      style: () => ({ color: this.color, size: this.size }),
      setLive: (s: StrokeEl | null) => this.renderer.setLive(s),
      onCommit: (c: Change) => this.history.push(c),
    };
    this.tools = {
      pen: new PenTool(stroke),
      highlighter: new HighlighterTool(stroke),
      eraser: new EraserTool({
        scene: this.scene,
        history: this.history,
        radius: () => ERASER_SCREEN_RADIUS / this.camera.zoom,
      }),
      // Hand has no stroke of its own: while it is selected, drags pan (see onDown).
      hand: new HandTool(),
    };
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onCancel);
    canvas.addEventListener("lostpointercapture", this.onCancel);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    window.addEventListener("blur", this.onBlur);
  }

  get tool(): ToolId {
    return this.toolId;
  }

  setTool(id: ToolId): void {
    if (!this.tools[id]) return;
    this.cancelStroke();
    this.toolId = id;
  }

  setColor(c: string): void {
    this.color = c;
  }

  setSize(s: number): void {
    this.size = s;
  }

  undo(): void {
    if (this.drawing) return;
    this.history.undo(this.scene);
  }

  redo(): void {
    if (this.drawing) return;
    this.history.redo(this.scene);
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  /** Fires whenever undo/redo availability may have changed. Returns an unsubscribe. */
  onHistoryChange(fn: () => void): () => void {
    return this.history.onChange(fn);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.renderer.resize(cssW, cssH, dpr);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelStroke();
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onCancel);
    c.removeEventListener("lostpointercapture", this.onCancel);
    c.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("blur", this.onBlur);
    this.renderer.destroy();
  }

  private get activeTool(): Tool | undefined {
    return this.tools[this.toolId];
  }

  /** Fingers currently down that take part in gestures (ignored palms excluded). */
  private touchCount(): number {
    let n = 0;
    for (const p of this.pointers.values()) if (p.kind === "touch" && p.mode !== "ignore") n++;
    return n;
  }

  private screenPoint(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private worldPoint(e: PointerEvent, kind: InputKind): WorldPoint {
    const [sx, sy] = this.screenPoint(e);
    const [x, y] = this.camera.screenToWorld(sx, sy);
    // Pencil reports real pressure; 0 can occur on the very first/last sample. Mouse/touch are simulated.
    const pressure = kind === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    return [x, y, pressure];
  }

  private info(e: PointerEvent, kind: InputKind): PointerInfo {
    return { kind, pressure: e.pressure, timeStamp: e.timeStamp, shiftKey: e.shiftKey };
  }

  private cancelStroke(): void {
    if (!this.drawing) return;
    const { tool } = this.drawing;
    this.drawing = null;
    tool.cancel();
  }

  private capture(e: PointerEvent): void {
    try {
      if (typeof this.canvas.setPointerCapture === "function") this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already gone; nothing to capture.
    }
  }

  private onDown = (e: PointerEvent): void => {
    const kind = e.pointerType;
    if (!isInputKind(kind)) return;
    if (kind === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const [sx, sy] = this.screenPoint(e);
    const isTouch = kind === "touch";
    const touches = isTouch ? this.touchCount() + 1 : 0;

    // A palm landing while the Pencil (or mouse) is writing is ignored for its whole life.
    if (isTouch && this.drawing && this.drawing.kind !== "touch") {
      this.pointers.set(e.pointerId, { kind, mode: "ignore", lastX: sx, lastY: sy });
      return;
    }

    const gesture = this.router.classify({ pointerType: kind, activeTouches: touches });

    // Anything else arriving mid finger-stroke (second finger, or the Pencil) cancels that stroke.
    if (this.drawing && this.drawing.kind === "touch") this.cancelStroke();
    if (isTouch && touches >= 2) {
      // The finger that was drawing becomes part of the gesture (the pinch).
      for (const p of this.pointers.values()) if (p.mode === "draw") p.mode = "pan";
    }

    this.trackTapDown(e, kind, touches, gesture.kind);
    this.capture(e);
    if (!isTouch && (this.spaceDown || this.toolId === "hand")) {
      // Space held or hand tool: a mouse/pen drag pans. Resting palms must not join in.
      for (const p of this.pointers.values()) if (p.kind === "touch") p.mode = "ignore";
      this.pointers.set(e.pointerId, { kind, mode: "pan", lastX: sx, lastY: sy });
    } else if (gesture.kind === "draw") {
      this.cancelStroke();
      // Pencil eraser end / barrel button erases for this stroke whatever tool is selected.
      const erasing = kind === "pen" && (e.button === 5 || (e.buttons & 32) !== 0);
      const tool = erasing ? this.tools.eraser : this.activeTool;
      if (!tool) return;
      if (!isTouch) {
        // Palm already resting when the Pencil (or mouse) lands: it must not pan or count as a finger.
        for (const p of this.pointers.values()) if (p.kind === "touch") p.mode = "ignore";
      }
      this.pointers.set(e.pointerId, { kind, mode: "draw", lastX: sx, lastY: sy });
      this.drawing = { id: e.pointerId, kind, tool };
      tool.down(this.worldPoint(e, kind), this.info(e, kind));
    } else if (gesture.kind === "pan" || gesture.kind === "pinch") {
      this.pointers.set(e.pointerId, { kind, mode: "pan", lastX: sx, lastY: sy });
    } else {
      this.pointers.set(e.pointerId, { kind, mode: "ignore", lastX: sx, lastY: sy });
    }
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const kind = e.pointerType;
    if (!isInputKind(kind)) return;
    if (p.mode === "draw" && this.drawing?.id === e.pointerId) {
      const list = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      const events = list.length > 0 ? list : [e];
      this.drawing.tool.move(
        events.map((ev) => this.worldPoint(ev, kind)),
        this.info(e, kind),
      );
      return;
    }
    const [sx, sy] = this.screenPoint(e);
    if (p.mode === "pan") this.gestureMove(e.pointerId, p, sx, sy);
    p.lastX = sx;
    p.lastY = sy;
  };

  /** Pen/mouse pans directly; one finger pans; exactly two fingers pinch. Re-baselined by lastX/lastY on every move. */
  private gestureMove(id: number, p: Active, sx: number, sy: number): void {
    if (p.kind !== "touch") {
      this.camera.panBy(sx - p.lastX, sy - p.lastY);
      this.renderer.requestFrame();
      return;
    }
    if (this.tap && this.tap.ids.includes(id)) this.tap.moved += Math.hypot(sx - p.lastX, sy - p.lastY);
    const fingers: Array<[number, Active]> = [];
    for (const [pid, q] of this.pointers) if (q.kind === "touch" && q.mode === "pan") fingers.push([pid, q]);
    if (fingers.length === 1) {
      this.camera.panBy(sx - p.lastX, sy - p.lastY);
    } else if (fingers.length === 2) {
      const other = fingers.find(([pid]) => pid !== id)?.[1];
      if (!other) return;
      const u = pinchUpdate(
        [[p.lastX, p.lastY], [other.lastX, other.lastY]],
        [[sx, sy], [other.lastX, other.lastY]],
      );
      this.camera.panBy(u.panDx, u.panDy);
      this.camera.zoomAt(u.centerX, u.centerY, u.zoomFactor);
    } else {
      return;
    }
    this.renderer.requestFrame();
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const a = wheelAction(e, r.height);
    if (a.kind === "zoom") this.camera.zoomAt(e.clientX - r.left, e.clientY - r.top, a.factor);
    else this.camera.panBy(a.dx, a.dy);
    this.renderer.requestFrame();
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.type === "keydown" && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      if (isEditable(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (e.code !== "Space") return;
    if (e.type === "keydown" && isEditable(e.target)) return;
    this.spaceDown = e.type === "keydown";
  };

  private onBlur = (): void => {
    this.spaceDown = false;
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.drawing?.id === e.pointerId) {
      const { tool } = this.drawing;
      this.drawing = null;
      tool.up();
    }
    this.trackTapUp(e);
  };

  private onCancel = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    this.tap = null;
    if (this.drawing?.id === e.pointerId) this.cancelStroke();
  };

  private trackTapDown(e: PointerEvent, kind: InputKind, touches: number, gesture: string): void {
    if (kind !== "touch" || gesture === "ignore") {
      this.tap = null;
      return;
    }
    if (touches === 2) {
      const first = [...this.pointers].find(([, p]) => p.kind === "touch" && p.mode !== "ignore");
      this.tap = first
        ? { t0: Date.now(), ids: [first[0], e.pointerId], up: 0, moved: 0, zoom0: this.camera.zoom }
        : null;
    } else {
      this.tap = null;
    }
  }

  private trackTapUp(e: PointerEvent): void {
    const tap = this.tap;
    if (!tap || !tap.ids.includes(e.pointerId)) return;
    tap.up++;
    if (tap.up < 2) return;
    this.tap = null;
    if (Date.now() - tap.t0 <= TAP_MAX_MS && tap.moved < TAP_MAX_MOVE && this.camera.zoom === tap.zoom0) {
      this.undo();
    }
  }
}
