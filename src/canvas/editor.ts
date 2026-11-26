import { Clipboard, pasteInto } from "./clipboard";
import { DoubleTap } from "./input/double-tap";
import { pinchUpdate } from "./input/pinch";
import { InputRouter, type InputKind } from "./input/router";
import { wheelAction } from "./input/wheel";
import { History } from "./model/history";
import { Scene } from "./model/scene";
import type { Change } from "./model/history";
import type { CanvasElement, StrokeEl, TextEl } from "./model/types";
import { cssFont, type TextStyleFields } from "./model/text-style";
import type { Measure } from "./model/wrap-text";
import { EraserTool } from "./tools/eraser";
import { HighlighterTool } from "./tools/highlighter";
import { ImageCrop, type CropHandle, type CropState } from "./tools/image-crop";
import { singleSelectedImage } from "./tools/image-resize";
import { pickColorAt } from "./tools/eyedropper";
import { LassoTool } from "./tools/lasso";
import { PenTool } from "./tools/pen";
import { TextEditing, TextTool, textAt, type TextStylePatch } from "./tools/text";
import type { PointerInfo, Tool, ToolId, WorldPoint } from "./tools/tool";
import { Selection } from "./selection";
import { clampSize, loadSettings, normalizeSettings, saveSettings, type StrokeToolId, type ToolSettings } from "./settings/tool-settings";
import type { Rect } from "./model/types";
import { Camera } from "./view/camera";
import { Renderer, type ImageLoader, type RendererOptions, type SnapshotOptions } from "./view/renderer";

export interface EditorOptions {
  elements: CanvasElement[];
  /** Test seams for the renderer (raf, path factory). */
  renderer?: RendererOptions;
  /** Loads photo cards' images; without it they stay grey placeholders. */
  loadImage?: ImageLoader;
  /** Drops cached signed URLs for an asset before its image load is retried. */
  forgetImage?: (assetPath: string) => void;
  /** The signed-in user id: scopes the device clipboard to this account. Without it, copies stay in memory. */
  owner?: string;
  /** Test seam; defaults to the device clipboard (localStorage) scoped to `owner`. */
  clipboard?: Clipboard;
}

/** off; armed (waiting for a tap on the page); unreadable (the last tap hit a photo whose pixels can't be read). */
export type EyedropperState = "off" | "armed" | "unreadable";

/** A tap picks within this many screen px of a stroke's path. */
const PICK_REACH_PX = 8;

type Active = { kind: InputKind; mode: "draw" | "pan" | "ignore"; lastX: number; lastY: number };

/** A two-finger tap: both fingers down and up within this long, barely moving. */
const TAP_MAX_MS = 250;
/** An auto text box being typed stops this many screen px short of the canvas's right edge (and wraps there). */
export const TEXT_EDGE_MARGIN_PX = 12;
const TAP_MAX_MOVE = 10;
/** Longest wait for photos before a page preview is drawn (they show as grey boxes if still loading). */
const PRELOAD_IMAGES_MS = 8_000;
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
  /** Crop mode of the selected photo (a DOM overlay drives it). */
  readonly crop: ImageCrop;
  readonly clipboard: Clipboard;
  /** Where a Paste offer is anchored (world), after a tap on empty space or an empty lasso. */
  private pasteAnchor: [number, number] | null = null;
  /** A colour-wheel drag on the selection in progress: the strokes as they were before it. */
  private recolorBefore: Change["before"] | null = null;
  /** The text box as it was when a live restyle (size slider drag) began; null when none is in progress. */
  private textStyleBefore: TextEl | null = null;
  private selectionKey = "";
  /** Two quick taps on a text box edit it, whatever tool is selected. */
  private doubleTap = new DoubleTap();
  /** A second tap that landed on a text box: edit it when that pointer lifts. */
  /** The stroke step committed by the previous pointer, for undoing a double-tap's first-tap dot. */
  private lastStroke: Change | null = null;
  private dbl: { pointerId: number; textId: string } | null = null;
  /** One-shot colour pick: armed from a colour panel, completed by the next draw-classified tap on the canvas. */
  private pick: { apply: (hex: string) => void } | null = null;
  private pickState: EyedropperState = "off";
  private pickListeners = new Set<() => void>();
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
  private toolListeners = new Set<(id: ToolId) => void>();
  /** A freshly inserted photo to select once the pointer in use lifts. */
  private pendingSelect: string | null = null;
  /** Bumps on every tool or selection change: lets an async insert tell whether the user moved on. */
  private interaction = 0;
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
    this.crop = new ImageCrop({
      scene: this.scene,
      history: this.history,
      preview: (p) => {
        this.renderer.setImagePreview(p);
        this.renderer.setSelection(p ? [] : this.selection.ids);
      },
      onChange: () => this.notifySelection(),
    });
    this.clipboard = opts.clipboard ?? new Clipboard({ owner: opts.owner });
    this.text = new TextEditing({
      scene: this.scene,
      history: this.history,
      style: () => this.current.text,
      measure: (style) => this.renderer.measureFor(style),
      onMeasured: (id) => this.noteMeasured(id),
      maxAutoWidth: (x, y) => {
        if (this.viewW <= 0) return Infinity;
        const [sx] = this.camera.worldToScreen(x, y);
        return (this.viewW - TEXT_EDGE_MARGIN_PX - sx) / this.camera.zoom;
      },
    });
    // A face that finishes loading changes text metrics: re-measure boxes measured with its fallback.
    this.renderer.onFontReady(() => this.remeasureTexts());
    this.text.onChange(() => {
      if (!this.text.session) this.commitTextStyle();
      this.renderer.setHidden(this.text.hiddenId);
      this.notifySelection();
    });
    this.selection.onChange(() => {
      const key = this.selection.ids.join(",");
      if (key !== this.selectionKey) {
        this.selectionKey = key;
        this.interaction++;
        this.commitRecolor();
        this.commitTextStyle();
        if (this.selection.ids.length > 0) this.pasteAnchor = null;
      }
      // Crop mode of another element (or none selected) ends it.
      if (this.crop.active && this.crop.id !== this.selection.ids[0]) this.crop.cancel();
      this.renderer.setSelection(this.crop.active ? [] : this.selection.ids);
      this.notifySelection();
    });
    // Elements removed elsewhere (eraser, undo, sync) drop out of the selection.
    this.scene.onChange(() => {
      this.selection.prune();
      if (this.crop.active && this.crop.id && !this.scene.get(this.crop.id)) this.crop.cancel();
    });
    const stroke = (tool: StrokeToolId) => ({
      scene: this.scene,
      style: () => ({ color: this.current[tool].color, size: this.current[tool].size }),
      setLive: (s: StrokeEl | null) => this.renderer.setLive(s),
      setGhost: (s: StrokeEl | null) => this.renderer.setGhost(s),
      snap: () => this.current[tool].snap,
      zoom: () => this.camera.zoom,
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
        measureText: (style) => this.renderer.measureFor(style),
        onTextMeasured: (id) => this.noteMeasured(id),
        onEmpty: (at) => {
          if (this.clipboard.isEmpty) return;
          this.pasteAnchor = at;
          this.notifySelection();
        },
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
    this.crop.cancel();
    this.cancelEyedropper();
    this.pendingSelect = null;
    this.interaction++;
    this.cancelStroke();
    this.text.commit();
    if (id !== "lasso") this.selection.clear();
    this.setPasteAnchor(null);
    this.toolId = id;
    for (const fn of [...this.toolListeners]) fn(id);
  }

  get eyedropper(): EyedropperState {
    return this.pickState;
  }

  /**
   * Arms the one-shot eyedropper: the next draw-classified tap (pen, mouse, or a finger the router lets draw) takes the
   * colour of the topmost element under it and passes it to `apply`, then the mode ends. Palm touches never pick.
   * False while a stroke is in progress or a crop is open.
   */
  armEyedropper(apply: (hex: string) => void): boolean {
    if (this.destroyed || this.drawing || this.crop.active) return false;
    this.pick = { apply };
    this.setPickState("armed");
    return true;
  }

  /** Ends the eyedropper without picking. Safe when it is not armed. */
  cancelEyedropper(): void {
    this.pick = null;
    this.setPickState("off");
  }

  /** Fires when the eyedropper arms, ends, or reports an unreadable photo. Returns an unsubscribe. */
  onEyedropperChange(fn: () => void): () => void {
    this.pickListeners.add(fn);
    return () => {
      this.pickListeners.delete(fn);
    };
  }

  private setPickState(s: EyedropperState): void {
    if (this.pickState === s) return;
    this.pickState = s;
    for (const fn of [...this.pickListeners]) fn();
  }

  /** Handles a canvas press while armed: true when it was a pick attempt (the pointer is then spent). */
  private tryPick(e: PointerEvent, kind: InputKind, sx: number, sy: number, touches: number): boolean {
    const pick = this.pick;
    if (!pick) return false;
    if (this.router.classify({ pointerType: kind, activeTouches: touches }).kind !== "draw") return false;
    // The press is consumed whatever it finds: it must not draw, select or pan.
    this.pointers.set(e.pointerId, { kind, mode: "ignore", lastX: sx, lastY: sy });
    const [x, y] = this.camera.screenToWorld(sx, sy);
    const r = pickColorAt({
      scene: this.scene,
      x,
      y,
      reach: PICK_REACH_PX / this.camera.zoom,
      image: (path) => this.renderer.readyImage(path),
    });
    if (r.kind === "color") {
      this.pick = null;
      this.setPickState("off");
      pick.apply(r.hex);
    } else if (r.kind === "unreadable") {
      this.pick = null;
      this.setPickState("unreadable");
    }
    // Nothing there: stays armed for another try.
    return true;
  }

  /** Fires after every tool switch (also those the editor makes itself). Returns an unsubscribe. */
  onToolChange(fn: (id: ToolId) => void): () => void {
    this.toolListeners.add(fn);
    return () => {
      this.toolListeners.delete(fn);
    };
  }

  /**
   * Switches to the lasso with the just-inserted element selected, so a photo's resize handles show.
   * Waits for a pen or finger in use (an upload can finish mid-stroke) rather than cutting its stroke.
   */
  selectInserted(id: string): void {
    if (this.destroyed) return;
    // Never interrupt a crop or typing in progress.
    if (this.crop.active || this.text.session) {
      this.pendingSelect = null;
      return;
    }
    if (this.drawing) {
      this.pendingSelect = id;
      return;
    }
    this.pendingSelect = null;
    this.setTool("lasso");
    this.selection.set([id]);
  }

  /** Changes whenever the tool or selection does. */
  interactionStamp(): number {
    return this.interaction;
  }

  /** The canvas size in CSS px. */
  viewSize(): [number, number] {
    return [this.viewW, this.viewH];
  }

  private flushPendingSelect(): void {
    const id = this.pendingSelect;
    if (id && !this.drawing) this.selectInserted(id);
  }

  /** Opens crop mode on the single selected photo. */
  beginCrop(): boolean {
    if (this.drawing) return false;
    const el = singleSelectedImage(this.scene, this.selection);
    return el ? this.crop.begin(el.id) : false;
  }

  cropState(): CropState | null {
    return this.crop.state();
  }

  /**
   * Starts dragging a crop handle at canvas-relative screen point (sx, sy). Follows the palm rules: with the
   * Pencil in use a finger never drags, and only one pointer drags at a time.
   */
  cropDragBegin(handle: CropHandle, pointerId: number, kind: string, sx: number, sy: number): boolean {
    if (!isInputKind(kind) || !this.crop.active) return false;
    if (this.crop.dragging) return false;
    const touches = kind === "touch" ? 1 : 0;
    if (this.router.classify({ pointerType: kind, activeTouches: touches }).kind !== "draw") return false;
    const [x, y] = this.camera.screenToWorld(sx, sy);
    return this.crop.beginDrag(handle, pointerId, x, y);
  }

  cropDragMove(pointerId: number, sx: number, sy: number): void {
    const [x, y] = this.camera.screenToWorld(sx, sy);
    this.crop.moveDrag(pointerId, x, y);
  }

  cropDragEnd(pointerId: number): void {
    this.crop.endDrag(pointerId);
  }

  /** Where the Paste offer is anchored (world), or null when there is none. */
  getPasteAnchor(): [number, number] | null {
    return this.pasteAnchor;
  }

  private setPasteAnchor(at: [number, number] | null): void {
    if (this.pasteAnchor === at) return;
    this.pasteAnchor = at;
    this.notifySelection();
  }

  /** Copies the selection to the clipboard (memory and device storage). */
  copySelection(): void {
    const els = this.selection.elements();
    if (els.length > 0) this.clipboard.copy(els);
  }

  /** Pastes the clipboard centred at `at` (default: the Paste anchor, else the view centre) as one undo step. */
  paste(at?: [number, number]): string[] {
    if (this.drawing || this.crop.active) return [];
    this.text.commit();
    const spot = at ?? this.pasteAnchor ?? this.viewportCenter();
    this.setPasteAnchor(null);
    return pasteInto({ scene: this.scene, history: this.history, selection: this.selection }, this.clipboard, spot);
  }

  /**
   * Recolours the selected strokes. Each call is one undo step, except `live` calls (colour-wheel
   * drags), which preview until {@link commitRecolor} makes the whole drag one step.
   */
  recolorSelection(color: string, opts?: { live?: boolean }): void {
    if (this.drawing) return;
    const c = this.selection.recolor(color);
    if (opts?.live) {
      if (this.recolorBefore === null) this.recolorBefore = c.before;
      else {
        const seen = new Set(this.recolorBefore.map((e) => e.id));
        for (const el of c.before) if (!seen.has(el.id)) this.recolorBefore.push(el);
      }
      return;
    }
    this.commitRecolor();
    if (c.before.length > 0) this.history.push(c);
  }

  /** Ends a live recolour: pushes it as one undo step. Safe to call when none is in progress. */
  commitRecolor(): void {
    const before = this.recolorBefore;
    this.recolorBefore = null;
    if (!before || before.length === 0) return;
    const after = before.map((el) => this.scene.get(el.id)).filter((el): el is CanvasElement => el !== undefined);
    this.history.push({ before, after });
  }

  /** The text element the style options act on: the box being edited, else the one selected text box. */
  private styleTargetId(): string | null {
    const sess = this.text.session;
    if (sess) return sess.id;
    const ids = this.selection.ids;
    return ids.length === 1 && this.scene.get(ids[0])?.type === "text" ? ids[0] : null;
  }

  /** Size, colour and style of the box the options act on, or null when there is none. */
  textStyle(): (TextStylePatch & { fontSize: number; color: string }) | null {
    const sess = this.text.session;
    if (sess) return { fontSize: sess.fontSize, color: sess.color, font: sess.font, bold: sess.bold, italic: sess.italic, underline: sess.underline };
    const id = this.styleTargetId();
    const el = id ? this.scene.get(id) : undefined;
    if (!el || el.type !== "text") return null;
    return { fontSize: el.fontSize, color: el.color, font: el.font, bold: el.bold, italic: el.italic, underline: el.underline };
  }

  /**
   * Restyles the text box being typed in, edited, or (when it is the only selection) selected; other boxes are
   * untouched. Each call is one undo step, except `live` calls (size slider drags), which preview until
   * {@link commitTextStyle}. Returns false when there is no such box.
   */
  restyleText(patch: TextStylePatch, opts?: { live?: boolean }): boolean {
    if (this.drawing) return false;
    const sess = this.text.session;
    if (sess && sess.id === null) {
      this.text.restyle(patch);
      return true;
    }
    const id = this.styleTargetId();
    const current = id ? this.scene.get(id) : undefined;
    if (!id || !current || current.type !== "text") return false;
    const next: TextStylePatch = { ...patch };
    // Undo merges `before` over the live element, so a style the box did not have must be named (as undefined).
    const before: TextEl = { ...current };
    for (const k of Object.keys(next) as (keyof TextStylePatch)[]) if (!(k in before)) Object.assign(before, { [k]: undefined });
    if (next.fontSize !== undefined) next.fontSize = clampSize("text", next.fontSize);
    const changed = (Object.keys(next) as (keyof TextStylePatch)[]).some((k) => (before[k] ?? false) !== (next[k] ?? false));
    if (!changed) return true;
    // An auto-width box re-measures in its new style; a fixed one keeps w and rewraps.
    // Both (not legacy boxes) store their re-measured line count.
    const resized: Partial<TextEl> = current.autoW !== undefined ? this.text.measureBox({ ...current, ...next }) : {};
    if (opts?.live) {
      if (this.textStyleBefore === null || this.textStyleBefore.id !== id) {
        this.commitTextStyle();
        this.textStyleBefore = before;
      }
    } else {
      this.commitTextStyle();
    }
    this.scene.update(id, { ...next, ...resized } satisfies Partial<TextEl>);
    this.noteMeasured(id);
    if (!opts?.live) {
      const after = this.scene.get(id);
      if (after) this.history.push({ before: [before], after: [after] });
    }
    if (sess) this.text.restyle(next);
    this.notifySelection();
    return true;
  }

  /** Ends a live restyle: pushes it as one undo step. Safe to call when none is in progress. */
  commitTextStyle(): void {
    const before = this.textStyleBefore;
    this.textStyleBefore = null;
    if (!before) return;
    const after = this.scene.get(before.id);
    if (after) this.history.push({ before: [before], after: [after] });
  }

  /**
   * Ids of text boxes this session stored a measured w/lines for while their face was still loading (so measured in
   * the fallback). Only these are ever re-measured: boxes merely viewed are never written, or a stale tab could
   * clobber another device's edit under last-write-wins.
   */
  private measuredEarly = new Set<string>();

  /** Called after this session stores a box's measured w/lines (commit, resize, restyle). */
  private noteMeasured(id: string): void {
    const el = this.scene.get(id);
    if (!el || el.type !== "text" || el.autoW === undefined) return;
    if (!this.renderer.fontLoaded(cssFont(el, el.fontSize))) this.measuredEarly.add(id);
  }

  /**
   * Once a face has loaded: re-measures the boxes this session measured before it did ({@link noteMeasured}) and
   * silently (no undo step) updates those off by more than 2 units or a line. Returns how many changed.
   */
  remeasureTexts(): number {
    if (this.destroyed || this.measuredEarly.size === 0) return 0;
    const patches: Array<[string, Partial<TextEl>]> = [];
    for (const id of [...this.measuredEarly]) {
      const el = this.scene.get(id);
      if (!el || el.type !== "text" || el.autoW === undefined) {
        this.measuredEarly.delete(id);
        continue;
      }
      // Still loading (another face finished first), being edited, or mid-restyle: its own commit measures again.
      if (!this.renderer.fontLoaded(cssFont(el, el.fontSize))) continue;
      this.measuredEarly.delete(id);
      if (id === this.text.hiddenId || id === this.textStyleBefore?.id) continue;
      const m = this.text.measureBox(el);
      if (Math.abs(m.w - el.w) > 2 || m.lines !== el.lines) patches.push([id, m]);
    }
    if (patches.length > 0) this.scene.batch(() => { for (const [id, p] of patches) this.scene.update(id, p); });
    return patches.length;
  }

  /** Measures text in `style` exactly as the canvas draws it (world units). */
  measureText(style: TextStyleFields): Measure {
    return this.renderer.measureFor(style);
  }

  /** Opens the single selected text box in the text editor. */
  editSelectedText(): boolean {
    const ids = this.selection.ids;
    if (ids.length !== 1 || this.scene.get(ids[0])?.type !== "text") return false;
    const id = ids[0];
    this.selection.clear();
    return this.text.beginEdit(id);
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
    if (this.drawing || this.crop.active || this.selection.ids.length === 0) return;
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
    // Undo while cropping only abandons the crop.
    if (this.crop.active) {
      this.crop.cancel();
      return;
    }
    this.text.commit();
    this.commitRecolor();
    this.commitTextStyle();
    this.selection.clear();
    this.history.undo(this.scene);
  }

  redo(): void {
    if (this.drawing) return;
    if (this.crop.active) {
      this.crop.cancel();
      return;
    }
    this.text.commit();
    this.commitRecolor();
    this.commitTextStyle();
    this.selection.clear();
    this.history.redo(this.scene);
  }

  /**
   * Call before replacing the page from a saved version: abandons an open crop (it would otherwise keep
   * previewing a photo that is about to change) and commits open text.
   */
  beforeRestore(): void {
    this.crop.cancel();
    this.text.commit();
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
  visibleElements(padBottom = 0): CanvasElement[] {
    const r = this.camera.viewRect(this.viewW, this.viewH);
    // padBottom (world units) also finds elements just below the view whose attachments reach into it.
    return this.scene.getVisible(padBottom > 0 ? { ...r, maxY: r.maxY + padBottom } : r);
  }

  /** Draws the scene onto another context through `camera` (page previews); false once destroyed. */
  drawSnapshot(ctx: CanvasRenderingContext2D, camera: Camera, w: number, h: number, opts?: SnapshotOptions): boolean {
    if (this.destroyed) return false;
    return this.renderer.drawSnapshot(ctx, camera, w, h, opts);
  }

  /** A photo inside `area` would taint an exported canvas (see isTaintedImage). */
  hasTaintedImages(area?: Rect): boolean {
    return !this.destroyed && this.renderer.hasTaintedImages(area);
  }

  /** Resolves once the photos inside `area` (default: all) are decoded, or after `timeoutMs`. Never rejects. */
  preloadImages(area?: Rect, timeoutMs = PRELOAD_IMAGES_MS): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    return this.renderer.preloadImages(timeoutMs, area);
  }

  /** A pointer is down on the canvas (drawing, erasing, panning) or text is being typed. */
  isInteracting(): boolean {
    return this.pointers.size > 0 || this.text.session !== null;
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
    this.commitRecolor();
    this.crop.cancel();
    this.settingsListeners.clear();
    this.toolListeners.clear();
    this.pickListeners.clear();
    this.pick = null;
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

    // Eyedropper armed: a draw-classified press picks instead of drawing, selecting or ending the typed text.
    if (this.pickState === "unreadable") this.setPickState("off");
    if (this.tryPick(e, kind, sx, sy, touches)) return;

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
    } else if (gesture.kind === "draw" && this.crop.active) {
      // Crop mode: the canvas does not draw or select. A finger still pans; the overlay owns the handles.
      this.pointers.set(e.pointerId, { kind, mode: isTouch ? "pan" : "ignore", lastX: sx, lastY: sy });
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
      this.commitRecolor();
      // A new press (never a palm: those are ignored or pan above) withdraws any Paste offer.
      this.setPasteAnchor(null);
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
    if (e.type === "keydown" && e.key === "Escape" && this.pick) {
      this.cancelEyedropper();
      return;
    }
    if (e.type === "keydown" && e.key === "Escape" && this.crop.active) {
      this.crop.cancel();
      return;
    }
    if (e.type === "keydown" && (e.key === "Delete" || e.key === "Backspace") && !isEditable(e.target)) {
      if (this.selection.ids.length === 0 || this.crop.active) return;
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
    this.flushPendingSelect();
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
    this.flushPendingSelect();
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
