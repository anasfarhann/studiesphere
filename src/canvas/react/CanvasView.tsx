"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Editor } from "../editor";
import type { ToolId } from "../tools/tool";
import type { CanvasElement } from "../model/types";
import { t } from "@/i18n/en";
import type { AttachmentService } from "../attachments/upload";
import type { RecordingOutbox } from "../attachments/recording-outbox";
import type { ElementStore } from "../persistence/store";
import { createImageLoader } from "../attachments/image-loader";
import { PhotoInserter, type PhotoStatus as PhotoState } from "../tools/insert-image";
import { FileInserter, type FileStatus as FileState } from "../tools/insert-file";
import { AudioRecorder, type AudioStatus } from "../tools/record-audio";
import { BackgroundRemover, type BackgroundStatus as BgState, type RemoveBackgroundFn } from "../tools/remove-background";
import type { ImageEl } from "../model/types";
import { BackgroundStatus } from "./BackgroundStatus";
import { ImagePreview } from "./ImagePreview";
import { AudioCards } from "./AudioCards";
import { FileCards } from "./FileCards";
import { FileStatus } from "./FileStatus";
import { PhotoStatus } from "./PhotoStatus";
import { RecordingBar } from "./RecordingBar";
import { TextEditorOverlay } from "./TextEditorOverlay";
import { HistoryPanel } from "./HistoryPanel";
import type { SnapshotStore } from "../persistence/snapshot-store";
import { CropOverlay } from "./CropOverlay";
import { SelectionMenu } from "./SelectionMenu";
import { Toolbar } from "./Toolbar";
import { hasOptions, ToolOptions } from "./ToolOptions";

declare global {
  interface Window {
    /** Test hook; only set outside production. */
    __editor?: Editor;
  }
}

const preventDefault = (e: Event) => e.preventDefault();

export interface AttachmentConfig {
  service: AttachmentService;
  ownerId: string;
  pageId: string;
  /** Where cards are saved when the canvas is already gone (a recording finishing in the background). */
  store?: ElementStore;
  /** Durable holding place for finished recordings until their card is saved. */
  outbox?: RecordingOutbox;
  /** Test seam (the dev canvas's stub): replaces the on-device background remover. */
  removeBackground?: RemoveBackgroundFn;
}

/** A stored photo's bytes, through its signed URL (a tainted <img> could not be read back). */
async function fetchAsset(signedUrl: string): Promise<Blob> {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.blob();
}

export interface CanvasViewProps {
  elements: CanvasElement[];
  /** Enables photo cards (Photo button, uploads, image loading). Like elements, read once. */
  attachments?: AttachmentConfig;
  /** Called once the editor exists; the returned cleanup runs before the editor is destroyed. */
  onEditor?: (editor: Editor) => (() => void) | void;
  /** Enables the Page history button and panel. */
  snapshots?: { store: SnapshotStore; pageId: string };
  /** Left of the top bar: the title pill. */
  topLeft?: ReactNode;
  /** Right of the top bar: the save status pill. */
  status?: ReactNode;
  /** Extra notices for the bottom stack, rendered above the photo/file/recording statuses. */
  notices?: ReactNode;
}

/** Full-size drawing canvas with the top bar floating over it. Fills its (flex) container. */
export function CanvasView({ elements, attachments, onEditor, snapshots, topLeft, status, notices }: CanvasViewProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Bottom of the top bar (it wraps with the viewport width); the history panel starts below it.
  const [barBottom, setBarBottom] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [tool, setTool] = useState<ToolId>("pen");
  const pickState = useSyncExternalStore(
    (cb) => (editor ? editor.onEyedropperChange(cb) : () => {}),
    () => editor?.eyedropper ?? "off",
    () => "off" as const,
  );
  const [cropping, setCropping] = useState(false);
  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  // Elements seed the editor once; later prop changes are not re-applied (persistence owns that, Task 12).
  const [initial] = useState(elements);
  // The first callback wins, like the elements: re-creating the editor would drop its scene.
  const [attach] = useState(() => onEditor);
  const [files] = useState(() => attachments);
  const photosRef = useRef<PhotoInserter | null>(null);
  const [photoState, setPhotoState] = useState<PhotoState>({ kind: "idle" });
  const fileInsRef = useRef<FileInserter | null>(null);
  const [fileState, setFileState] = useState<FileState>({ kind: "idle" });
  const audioRef = useRef<AudioRecorder | null>(null);
  const [audioState, setAudioState] = useState<AudioStatus>({ kind: "idle" });
  const bgRef = useRef<BackgroundRemover | null>(null);
  const [bgState, setBgState] = useState<BgState>({ kind: "idle" });
  const [previewing, setPreviewing] = useState<ImageEl | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const editor = new Editor(canvas, {
      elements: initial,
      // The page's signed-in user: copies never reach another account on this device.
      owner: files?.ownerId,
      forgetImage: files ? (path) => files.service.forgetSignedUrl(path) : undefined,
      loadImage: files ? createImageLoader((path) => files.service.signedUrl(path)) : undefined,
    });
    editorRef.current = editor;
    let offPhoto = () => {};
    let offAudio = () => {};
    let offFile = () => {};
    let offBg = () => {};
    if (files) {
      const photos = new PhotoInserter({
        scene: editor.scene,
        history: editor.history,
        ownerId: files.ownerId,
        pageId: files.pageId,
        center: () => editor.viewportCenter(),
        upload: (blob, o) => files.service.uploadAttachment(blob, o),
        stamp: () => editor.interactionStamp(),
        onInserted: (id, auto) => {
          if (auto) editor.selectInserted(id);
        },
      });
      photosRef.current = photos;
      offPhoto = photos.onStatus(setPhotoState);
      const fileIns = new FileInserter({
        scene: editor.scene,
        history: editor.history,
        ownerId: files.ownerId,
        pageId: files.pageId,
        center: () => editor.viewportCenter(),
        upload: (blob, o) => files.service.uploadAttachment(blob, o),
      });
      fileInsRef.current = fileIns;
      offFile = fileIns.onStatus(setFileState);
      const audio = new AudioRecorder({
        scene: editor.scene,
        history: editor.history,
        ownerId: files.ownerId,
        pageId: files.pageId,
        center: () => editor.viewportCenter(),
        upload: (blob, o) => files.service.uploadAttachment(blob, o),
        outbox: files.outbox,
        store: files.store,
      });
      audioRef.current = audio;
      offAudio = audio.onStatus(setAudioState);
      const bg = new BackgroundRemover({
        scene: editor.scene,
        history: editor.history,
        ownerId: files.ownerId,
        pageId: files.pageId,
        fetchOriginal: async (path) => fetchAsset(await files.service.signedUrl(path)),
        upload: (blob, o) => files.service.uploadAttachment(blob, o),
        remove: files.removeBackground,
      });
      bgRef.current = bg;
      offBg = bg.onStatus(setBgState);
    }
    setEditor(editor);
    if (process.env.NODE_ENV !== "production") window.__editor = editor;
    const syncHist = () => setHist({ canUndo: editor.canUndo(), canRedo: editor.canRedo() });
    const offHist = editor.onHistoryChange(syncHist);
    const offTool = editor.onToolChange(setTool);
    const offCrop = editor.onSelectionChange(() => setCropping(editor.crop.active));
    const detach = attach?.(editor);

    const fit = () => {
      const r = box.getBoundingClientRect();
      editor.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    // devicePixelRatio changes (browser zoom, moving between screens) do not resize the box.
    let dprQuery: MediaQueryList | null = null;
    const watchDpr = () => {
      dprQuery?.removeEventListener("change", onDpr);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener("change", onDpr);
    };
    const onDpr = () => {
      fit();
      watchDpr();
    };
    watchDpr();

    // iOS Safari: stop scroll bounce, double-tap zoom and pinch-zoom of the page while on the canvas.
    const opts: AddEventListenerOptions = { passive: false };
    canvas.addEventListener("touchstart", preventDefault, opts);
    canvas.addEventListener("touchmove", preventDefault, opts);
    canvas.addEventListener("gesturestart", preventDefault, opts);
    canvas.addEventListener("gesturechange", preventDefault, opts);
    canvas.addEventListener("gestureend", preventDefault, opts);
    canvas.addEventListener("dblclick", preventDefault);
    canvas.addEventListener("contextmenu", preventDefault);

    return () => {
      ro.disconnect();
      dprQuery?.removeEventListener("change", onDpr);
      canvas.removeEventListener("touchstart", preventDefault);
      canvas.removeEventListener("touchmove", preventDefault);
      canvas.removeEventListener("gesturestart", preventDefault);
      canvas.removeEventListener("gesturechange", preventDefault);
      canvas.removeEventListener("gestureend", preventDefault);
      canvas.removeEventListener("dblclick", preventDefault);
      canvas.removeEventListener("contextmenu", preventDefault);
      // Open text goes into the scene before the autosave detach does its final flush.
      editor.text.commit();
      offPhoto();
      photosRef.current?.dispose();
      photosRef.current = null;
      offFile();
      fileInsRef.current?.dispose();
      fileInsRef.current = null;
      offAudio();
      audioRef.current?.dispose();
      audioRef.current = null;
      offBg();
      bgRef.current?.dispose();
      bgRef.current = null;
      offHist();
      offTool();
      offCrop();
      detach?.();
      editor.destroy();
      if (window.__editor === editor) delete window.__editor;
      editorRef.current = null;
      setEditor(null);
    };
  }, [initial, attach, files]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => setBarBottom(bar.offsetTop + bar.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  // Closing the tab while recording or uploading asks first (in-app navigation is handled by the hand-off).
  const audioBusy = audioState.kind === "recording" || audioState.kind === "uploading";
  useEffect(() => {
    if (!audioBusy) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [audioBusy]);

  const pickTool = (id: ToolId) => {
    setTool(id);
    editorRef.current?.setTool(id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          data-testid="canvas"
          aria-label={t("canvasLabel")}
          className="absolute inset-0 block"
          style={{
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
            WebkitTapHighlightColor: "transparent",
            overscrollBehavior: "none",
            cursor: pickState === "armed" ? "crosshair" : undefined,
          }}
        />
        <Toolbar barRef={barRef} left={topLeft} status={status} tool={tool} onTool={pickTool} optionsHidden={pickState === "armed"} renderOptions={(id) => (editor && hasOptions(id) ? <ToolOptions editor={editor} tool={id} /> : null)}
          canUndo={hist.canUndo && !cropping}
          canRedo={hist.canRedo && !cropping}
          onUndo={() => editorRef.current?.undo()}
          onRedo={() => editorRef.current?.redo()}
          onPhoto={files ? (file) => void photosRef.current?.insert(file) : undefined}
          onFile={files ? (file) => void fileInsRef.current?.insert(file) : undefined}
          onRecord={files ? () => void audioRef.current?.start() : undefined}
          onHistory={snapshots ? () => setHistoryOpen((o) => !o) : undefined}
          recordDisabled={audioState.kind === "recording" || audioState.kind === "uploading" || audioState.kind === "oversize"}
        />
        <div
          data-testid="notice-stack"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 px-3 pt-3"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          {notices}
          {pickState !== "off" ? (
            <div
              data-testid="eyedropper-hint"
              role="status"
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-ink py-1 pl-4 pr-1 text-sm font-medium text-card shadow-[0_8px_28px_rgba(27,26,31,0.18)]"
            >
              <span>{pickState === "armed" ? t("eyedropperHint") : t("eyedropperUnreadable")}</span>
              <button
                type="button"
                onClick={() => editor?.cancelEyedropper()}
                className="inline-flex h-11 min-w-11 touch-manipulation cursor-pointer items-center justify-center rounded-full px-3 text-sm font-medium text-card underline underline-offset-2"
              >
                {pickState === "armed" ? t("eyedropperCancel") : t("dismiss")}
              </button>
            </div>
          ) : null}
          <BackgroundStatus status={bgState} onCancel={() => bgRef.current?.cancel()} onDismiss={() => bgRef.current?.dismiss()} />
          <PhotoStatus
            status={photoState}
            onRetry={() => void photosRef.current?.retry()}
            onDismiss={() => photosRef.current?.dismiss()}
          />
          <FileStatus
            status={fileState}
            onRetry={() => void fileInsRef.current?.retry()}
            onDismiss={() => fileInsRef.current?.dismiss()}
          />
          <RecordingBar
            status={audioState}
            onStop={() => void audioRef.current?.stop()}
            onCancel={() => audioRef.current?.cancel()}
            onRetry={() => void audioRef.current?.retry()}
            onDismiss={() => audioRef.current?.dismiss()}
            onSaveToDevice={() => audioRef.current?.saveToDevice()}
            onDiscardOversize={() => void audioRef.current?.discardOversize()}
          />
        </div>
        {editor && files ? (
          <AudioCards
            editor={editor}
            resolveUrl={(path) => files.service.signedUrl(path)}
            forgetUrl={(path) => files.service.forgetSignedUrl(path)}
          />
        ) : null}
        {editor && files ? (
          <FileCards
            editor={editor}
            resolveUrl={(path) => files.service.signedUrl(path)}
            forgetUrl={(path) => files.service.forgetSignedUrl(path)}
          />
        ) : null}
        {editor ? <TextEditorOverlay editor={editor} /> : null}
        {editor ? (
          <SelectionMenu
            editor={editor}
            topInset={barBottom}
            image={
              files
                ? {
                    removing: bgState.kind === "working",
                    onRemoveBackground: (id) => void bgRef.current?.start(id),
                    onPreview: (id) => {
                      const el = editor.scene.get(id);
                      if (el?.type === "image") setPreviewing(el);
                    },
                  }
                : undefined
            }
          />
        ) : null}
        {editor ? <CropOverlay editor={editor} /> : null}
        {previewing && files ? <ImagePreview image={previewing} resolveUrl={files.service.signedUrl.bind(files.service)} onClose={() => setPreviewing(null)} /> : null}
        {editor && snapshots && historyOpen ? (
          <HistoryPanel store={snapshots.store} pageId={snapshots.pageId} editor={editor} onClose={() => setHistoryOpen(false)} top={barBottom + 8} />
        ) : null}
      </div>
    </div>
  );
}
