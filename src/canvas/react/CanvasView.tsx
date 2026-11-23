"use client";

import { useEffect, useRef, useState } from "react";
import { Editor } from "../editor";
import type { ToolId } from "../tools/tool";
import type { CanvasElement } from "../model/types";
import { t } from "@/i18n/en";
import { TextEditorOverlay } from "./TextEditorOverlay";
import { SelectionMenu } from "./SelectionMenu";
import { INK_COLORS, PEN_SIZES, Toolbar } from "./Toolbar";

declare global {
  interface Window {
    /** Test hook; only set outside production. */
    __editor?: Editor;
  }
}

const preventDefault = (e: Event) => e.preventDefault();

export interface CanvasViewProps {
  elements: CanvasElement[];
  /** Called once the editor exists; the returned cleanup runs before the editor is destroyed. */
  onEditor?: (editor: Editor) => (() => void) | void;
}

/** Toolbar + full-size drawing canvas. Fills its (flex) container. */
export function CanvasView({ elements, onEditor }: CanvasViewProps) {
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

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const editor = new Editor(canvas, { elements: initial });
    editorRef.current = editor;
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
      offHist();
      detach?.();
      editor.destroy();
      if (window.__editor === editor) delete window.__editor;
      editorRef.current = null;
      setEditor(null);
    };
  }, [initial, attach]);

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
      <Toolbar tool={tool} onTool={pickTool} color={color} size={size} onColor={pickColor} onSize={pickSize}
        canUndo={hist.canUndo}
        canRedo={hist.canRedo}
        onUndo={() => editorRef.current?.undo()}
        onRedo={() => editorRef.current?.redo()}
      />
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
        {editor ? <TextEditorOverlay editor={editor} /> : null}
        {editor ? <SelectionMenu editor={editor} /> : null}
      </div>
    </div>
  );
}
