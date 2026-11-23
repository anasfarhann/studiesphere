"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { AudioCards } from "./AudioCards";
import { FileCards } from "./FileCards";
import { FileStatus } from "./FileStatus";
import { PhotoStatus } from "./PhotoStatus";
import { RecordingBar } from "./RecordingBar";
import { TextEditorOverlay } from "./TextEditorOverlay";
import { HistoryPanel } from "./HistoryPanel";
import type { SnapshotStore } from "../persistence/snapshot-store";
import { SelectionMenu } from "./SelectionMenu";
import { INK_COLORS, PEN_SIZES, Toolbar } from "./Toolbar";

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
}

/** Full-size drawing canvas with the top bar floating over it. Fills its (flex) container. */
export function CanvasView({ elements, attachments, onEditor, snapshots, topLeft, status }: CanvasViewProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [color, setColor] = useState(INK_COLORS[0].value);
  const [tool, setTool] = useState<ToolId>("pen");
  const [size, setSize] = useState(PEN_SIZES[1].value);
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

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const editor = new Editor(canvas, {
      elements: initial,
      forgetImage: files ? (path) => files.service.forgetSignedUrl(path) : undefined,
      loadImage: files ? createImageLoader((path) => files.service.signedUrl(path)) : undefined,
    });
    editorRef.current = editor;
    let offPhoto = () => {};
    let offAudio = () => {};
    let offFile = () => {};
    if (files) {
      const photos = new PhotoInserter({
        scene: editor.scene,
        history: editor.history,
        ownerId: files.ownerId,
        pageId: files.pageId,
        center: () => editor.viewportCenter(),
        upload: (blob, o) => files.service.uploadAttachment(blob, o),
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
    }
    setEditor(editor);
    if (process.env.NODE_ENV !== "production") window.__editor = editor;
    const syncHist = () => setHist({ canUndo: editor.canUndo(), canRedo: editor.canRedo() });
    const offHist = editor.onHistoryChange(syncHist);
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
      offHist();
      detach?.();
      editor.destroy();
      if (window.__editor === editor) delete window.__editor;
      editorRef.current = null;
      setEditor(null);
    };
  }, [initial, attach, files]);

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

  const pickColor = (c: string) => {
    setColor(c);
    editorRef.current?.setColor(c);
  };
  const pickTool = (id: ToolId) => {
    setTool(id);
    editorRef.current?.setTool(id);
  };
  const pickSize = (s: number) => {
    setSize(s);
    editorRef.current?.setSize(s);
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
          }}
        />
        <Toolbar left={topLeft} status={status} tool={tool} onTool={pickTool} color={color} size={size} onColor={pickColor} onSize={pickSize}
          canUndo={hist.canUndo}
          canRedo={hist.canRedo}
          onUndo={() => editorRef.current?.undo()}
          onRedo={() => editorRef.current?.redo()}
          onPhoto={files ? (file) => void photosRef.current?.insert(file) : undefined}
          onFile={files ? (file) => void fileInsRef.current?.insert(file) : undefined}
          onRecord={files ? () => void audioRef.current?.start() : undefined}
          onHistory={snapshots ? () => setHistoryOpen((o) => !o) : undefined}
          recordDisabled={audioState.kind === "recording" || audioState.kind === "uploading" || audioState.kind === "oversize"}
        />
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
        {editor ? <SelectionMenu editor={editor} /> : null}
        {editor && snapshots && historyOpen ? (
          <HistoryPanel store={snapshots.store} pageId={snapshots.pageId} editor={editor} onClose={() => setHistoryOpen(false)} />
        ) : null}
      </div>
    </div>
  );
}
