import { InputRouter, type InputKind } from "./input/router";
import { Scene } from "./model/scene";
import type { CanvasElement } from "./model/types";
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

const DEFAULT_COLOR = "#111827";
const DEFAULT_SIZE = 4;

function isInputKind(t: string): t is InputKind {
  return t === "pen" || t === "touch" || t === "mouse";
}

/** Wires scene, camera, renderer, input router and tools to a canvas element. */
export class Editor {
  readonly scene: Scene;
  readonly camera = new Camera();
  readonly router = new InputRouter();
  private renderer: Renderer;
  private tools: Partial<Record<ToolId, Tool>>;
  private toolId: ToolId = "pen";
  private color = DEFAULT_COLOR;
  private size = DEFAULT_SIZE;
  /** Every pointer currently down on the canvas, by pointerId. */
  private pointers = new Map<number, Active>();
  /** The pointer feeding the current tool, if any. */
  private drawing: { id: number; kind: InputKind } | null = null;
  private destroyed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: EditorOptions,
  ) {
    this.scene = new Scene(opts.elements);
    this.renderer = new Renderer(canvas, this.scene, this.camera, opts.renderer);
    this.tools = {
      pen: new PenTool({
        scene: this.scene,
        style: () => ({ color: this.color, size: this.size }),
        setLive: (s) => this.renderer.setLive(s),
      }),
    };
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onCancel);
    canvas.addEventListener("lostpointercapture", this.onCancel);
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
    this.drawing = null;
    this.activeTool?.cancel();
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
      // The finger that was drawing becomes part of the gesture; pinch itself arrives in Task 11.
      for (const p of this.pointers.values()) if (p.mode === "draw") p.mode = "pan";
    }

    this.capture(e);
    if (gesture.kind === "draw") {
      this.cancelStroke();
      const tool = this.activeTool;
      if (!tool) return;
      this.pointers.set(e.pointerId, { kind, mode: "draw", lastX: sx, lastY: sy });
      this.drawing = { id: e.pointerId, kind };
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
      this.activeTool?.move(
        events.map((ev) => this.worldPoint(ev, kind)),
        this.info(e, kind),
      );
      return;
    }
    const [sx, sy] = this.screenPoint(e);
    if (p.mode === "pan" && this.panPointers() === 1) {
      this.camera.panBy(sx - p.lastX, sy - p.lastY);
      this.renderer.requestFrame();
    }
    p.lastX = sx;
    p.lastY = sy;
  };

  private panPointers(): number {
    let n = 0;
    for (const p of this.pointers.values()) if (p.mode === "pan") n++;
    return n;
  }

  private onUp = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.drawing?.id === e.pointerId) {
      this.drawing = null;
      this.activeTool?.up();
    }
  };

  private onCancel = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.drawing?.id === e.pointerId) this.cancelStroke();
  };
}
