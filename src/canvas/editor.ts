import { DoubleTap } from "./input/double-tap";
import { pinchUpdate } from "./input/pinch";
import { InputRouter, type InputKind } from "./input/router";
import { wheelAction } from "./input/wheel";
import { History } from "./model/history";
import { Scene } from "./model/scene";
import type { Change } from "./model/history";
import type { CanvasElement, StrokeEl } from "./model/types";
import { EraserTool } from "./tools/eraser";
import { HighlighterTool } from "./tools/highlighter";
import { LassoTool } from "./tools/lasso";
import { PenTool } from "./tools/pen";
import { TextEditing, TextTool, textAt } from "./tools/text";
import type { PointerInfo, Tool, ToolId, WorldPoint } from "./tools/tool";
import { Selection } from "./selection";
import { loadSettings, normalizeSettings, saveSettings, type StrokeToolId, type ToolSettings } from "./settings/tool-settings";
import type { Rect } from "./model/types";
import { Camera } from "./view/camera";
import { Renderer, type ImageLoader, type RendererOptions } from "./view/renderer";

export interface EditorOptions {
  elements: CanvasElement[];
  /** Test seams for the renderer (raf, path factory). */
  renderer?: RendererOptions;
  /** Loads photo cards' images; without it they stay grey placeholders. */
  loadImage?: ImageLoader;
  /** Drops cached signed URLs for an asset before its image load is retried. */
  forgetImage?: (assetPath: string) => void;
}

type Active = { kind: InputKind; mode: "draw" | "pan" | "ignore"; lastX: number; lastY: number };

/** A two-finger tap: both fingers down and up within this long, barely moving. */
const TAP_MAX_MS = 250;
const TAP_MAX_MOVE = 10;
type Tap = { t0: number; ids: [number, number]; up: number; moved: number; zoom0: number };

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
  readonly selection: Selection;
  readonly text: TextEditing;
  /** Two quick taps on a text box edit it, whatever tool is selected. */
  private doubleTap = new DoubleTap();
  /** A second tap that landed on a text box: edit it when that pointer lifts. */
  /** The stroke step committed by the previous pointer, for undoing a double-tap's first-tap dot. */
  private lastStroke: Change | null = null;
  private dbl: { pointerId: number; textId: string } | null = null;
  private renderer: Renderer;
  private tools: Partial<Record<ToolId, Tool>>;
  private toolId: ToolId = "pen";
  private current: ToolSettings = loadSettings();
  private settingsListeners = new Set<() => void>();
  private settingsTimer: ReturnType<typeof setTimeout> | null = null;
  private settingsDirty = false;
  /** Every pointer currently down on the canvas, by pointerId. */
  private pointers = new Map<number, Active>();
  /** The pointer feeding the current tool, if any. */
  private drawing: { id: number; kind: InputKind; tool: Tool } | null = null;
  private tap: Tap | null = null;
  private selectionListeners = new Set<() => void>();
  private selectionFrame: number | null = null;
  private raf: (cb: () => void) => number;
  private caf: (id: number) => void;
  private spaceDown = false;
  private viewW = 0;
  private viewH = 0;
  private destroyed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    opts: EditorOptions,
  ) {
    this.scene = new Scene(opts.elements);
    this.raf = opts.renderer?.raf ?? ((cb) => window.requestAnimationFrame(cb));
    this.caf = opts.renderer?.caf ?? ((id) => window.cancelAnimationFrame(id));
    this.renderer = new Renderer(canvas, this.scene, this.camera, { loadImage: opts.loadImage, forgetImage: opts.forgetImage, ...opts.renderer });
    this.selection = new Selection(this.scene);
    this.text = new TextEditing({ scene: this.scene, history: this.history, color: () => this.current.text.color, fontSize: () => this.current.text.size });
    this.text.onChange(() => {
      this.renderer.setHidden(this.text.hiddenId);
      this.notifySelection();
    });
    this.selection.onChange(() => {
      this.renderer.setSelection(this.selection.ids);
      this.notifySelection();
    });
    // Elements removed elsewhere (eraser, undo, sync) drop out of the selection.
    this.scene.onChange(() => this.selection.prune());
    const stroke = (tool: StrokeToolId) => ({
      scene: this.scene,
      style: () => ({ color: this.current[tool].color, size: this.current[tool].size }),
      setLive: (s: StrokeEl | null) => this.renderer.setLive(s),
      onCommit: (c: Change) => {
        this.history.push(c);
        this.lastStroke = c;
      },
    });
    this.tools = {
      pen: new PenTool(stroke("pen")),
      highlighter: new HighlighterTool(stroke("highlighter")),
      eraser: new EraserTool({
        scene: this.scene,
        history: this.history,
        radius: () => this.current.eraser.size / 2 / this.camera.zoom,
        mode: () => this.current.eraser.mode,
      }),
      lasso: new LassoTool({
        scene: this.scene,
        history: this.history,
        selection: this.selection,
        setLasso: (pts) => this.renderer.setLasso(pts),
        zoom: () => this.camera.zoom,
      }),
      text: new TextTool({ scene: this.scene, editing: this.text, slop: () => 6 / this.camera.zoom }),
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
    // Registered before autosave's own listeners, so open text reaches the scene before its flush.
    document.addEventListener("visibilitychange", this.onHide);
    window.addEventListener("pagehide", this.onHide);
  }

  get tool(): ToolId {
    return this.toolId;
  }

  setTool(id: ToolId): void {
    if (!this.tools[id]) return;
    this.cancelStroke();
    this.text.commit();
    if (id !== "lasso") this.selection.clear();
    this.toolId = id;
  }

  /** Bounds of the current selection in world coordinates, or null. */
  getSelectionBounds(): Rect | null {
    return this.selection.bounds();
  }

  /** Fires when the selection (or its on-screen position) changes. Returns an unsubscribe. */
  onSelectionChange(fn: () => void): () => void {
    this.selectionListeners.add(fn);
    return () => {
      this.selectionListeners.delete(fn);
    };
  }

  /** Deletes the selection as one undo step. */
  deleteSelection(): void {
    if (this.drawing || this.selection.ids.length === 0) return;
    const c = this.selection.deleteAll();
    if (c.before.length > 0) this.history.push(c);
  }

  /** Coalesced: at most one listener round per animation frame, however many events arrive. */
  private notifySelection(): void {
    if (this.selectionFrame !== null || this.destroyed) return;
    this.selectionFrame = this.raf(() => {
      this.selectionFrame = null;
      for (const fn of [...this.selectionListeners]) fn();
    });
  }

  /** The current per-tool settings (replaced, never mutated, on every update). */
  get settings(): ToolSettings {
    return this.current;
  }

  /**
   * Applies `patch` to the settings (normalised: sizes clamped, colours validated, preset rules enforced),
   * notifies listeners and persists. With `deferSave` (slider drags) the live value updates at once but the
   * write waits for {@link flushSettings} or a 250 ms pause.
   */
  updateSettings(patch: (s: ToolSettings) => ToolSettings, opts?: { deferSave?: boolean }): void {
    const next = normalizeSettings(patch(this.current));
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    this.current = next;
    if (opts?.deferSave) {
      this.settingsDirty = true;
      if (this.settingsTimer !== null) clearTimeout(this.settingsTimer);
      this.settingsTimer = setTimeout(() => this.flushSettings(), 250);
    } else {
      this.settingsDirty = true;
      this.flushSettings();
    }
    for (const fn of [...this.settingsListeners]) fn();
  }

  /** Writes any pending settings change to storage now. */
  flushSettings(): void {
    if (this.settingsTimer !== null) clearTimeout(this.settingsTimer);
    this.settingsTimer = null;
    if (!this.settingsDirty) return;
    this.settingsDirty = false;
    saveSettings(this.current);
  }

  /** Fires after every settings change. Returns an unsubscribe. */
  onSettingsChange(fn: () => void): () => void {
    this.settingsListeners.add(fn);
    return () => {
      this.settingsListeners.delete(fn);
    };
  }

  /**
   * Open text is committed first (its own undo step): iPad Safari does not blur the textarea on a
   * toolbar tap, so without this the typed text would be lost when undo removes or changes its box.
   */
  undo(): void {
    if (this.drawing) return;
    this.text.commit();
    this.selection.clear();
    this.history.undo(this.scene);
  }

  redo(): void {
    if (this.drawing) return;
    this.text.commit();
    this.selection.clear();
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

  /** The middle of the visible area, in world coordinates. */
  viewportCenter(): [number, number] {
    return this.camera.screenToWorld(this.viewW / 2, this.viewH / 2);
  }

  /** Elements in the visible area (what the renderer draws), by z. */
  visibleElements(): CanvasElement[] {
    return this.scene.getVisible(this.camera.viewRect(this.viewW, this.viewH));
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.viewW = cssW;
    this.viewH = cssH;
    this.renderer.resize(cssW, cssH, dpr);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.flushSettings();
    this.settingsListeners.clear();
    if (this.selectionFrame !== null) this.caf(this.selectionFrame);
    this.selectionFrame = null;
    this.cancelStroke();
    this.text.commit();
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
    document.removeEventListener("visibilitychange", this.onHide);
    window.removeEventListener("pagehide", this.onHide);
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

    // Pressing the canvas ends any text being typed (blur does not reliably fire when pointerdown is cancelled).
    this.text.commit();
    this.doubleTap.down(e.pointerId, sx, sy);
    const prevStroke = this.lastStroke;
    this.lastStroke = null;
    if (this.detectDoubleTap(e, kind, sx, sy, touches, prevStroke)) return;

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

  /** Second quick tap on a text box: claim the pointer (no stroke) and edit on pointer up. */
  private detectDoubleTap(e: PointerEvent, kind: InputKind, sx: number, sy: number, touches: number, prevStroke: Change | null): boolean {
    if (touches > 1 || this.pointers.size > 0 || !this.doubleTap.isSecond(sx, sy)) return false;
    const [wx, wy] = this.camera.screenToWorld(sx, sy);
    const textId = textAt(this.scene, wx, wy);
    if (!textId) return false;
    // The first tap already drew a dot (own undo step): the double tap must leave only the edit.
    if (prevStroke && this.history.discard(prevStroke)) {
      this.scene.batch(() => {
        for (const el of prevStroke.after) this.scene.remove(el.id);
      });
    }
    this.capture(e);
    this.dbl = { pointerId: e.pointerId, textId };
    this.pointers.set(e.pointerId, { kind, mode: "ignore", lastX: sx, lastY: sy });
    return true;
  }

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
      this.notifySelection();
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
    this.notifySelection();
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const a = wheelAction(e, r.height);
    if (a.kind === "zoom") this.camera.zoomAt(e.clientX - r.left, e.clientY - r.top, a.factor);
    else this.camera.panBy(a.dx, a.dy);
    this.renderer.requestFrame();
    this.notifySelection();
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.type === "keydown" && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      if (isEditable(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (e.type === "keydown" && (e.key === "Delete" || e.key === "Backspace") && !isEditable(e.target)) {
      if (this.selection.ids.length === 0) return;
      e.preventDefault();
      this.deleteSelection();
      return;
    }
    if (e.code !== "Space") return;
    if (e.type === "keydown" && isEditable(e.target)) return;
    this.spaceDown = e.type === "keydown";
  };

  private onHide = (e: Event): void => {
    if (e.type === "pagehide" || document.visibilityState === "hidden") this.text.commit();
  };

  private onBlur = (): void => {
    this.spaceDown = false;
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    this.noteTap(e);
    if (this.drawing?.id === e.pointerId) {
      const { tool } = this.drawing;
      this.drawing = null;
      tool.up();
    }
    this.trackTapUp(e);
  };

  /** Remembers short, still taps (for double-tap) and starts a pending double-tap edit. */
  private noteTap(e: PointerEvent): void {
    const dbl = this.dbl;
    if (dbl && dbl.pointerId === e.pointerId) {
      this.dbl = null;
      this.doubleTap.forget(e.pointerId);
      this.doubleTap.reset();
      this.text.beginEdit(dbl.textId);
      return;
    }
    const [sx, sy] = this.screenPoint(e);
    this.doubleTap.up(e.pointerId, sx, sy);
  }

  private onCancel = (e: PointerEvent): void => {
    this.doubleTap.forget(e.pointerId);
    if (this.dbl?.pointerId === e.pointerId) this.dbl = null;
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
