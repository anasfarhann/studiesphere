"use client";

import { useEffect, useRef, useState } from "react";
import { Editor } from "../editor";
import type { CanvasElement } from "../model/types";
import { t } from "@/i18n/en";
import { INK_COLORS, PEN_SIZES, Toolbar } from "./Toolbar";

declare global {
  interface Window {
    /** Test hook; only set outside production. */
    __editor?: Editor;
  }
}

const preventDefault = (e: Event) => e.preventDefault();

/** Toolbar + full-size drawing canvas. Fills its (flex) container. */
export function CanvasView({ elements }: { elements: CanvasElement[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [color, setColor] = useState(INK_COLORS[0].value);
  const [size, setSize] = useState(PEN_SIZES[1].value);
  // Elements seed the editor once; later prop changes are not re-applied (persistence owns that, Task 12).
  const [initial] = useState(elements);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const editor = new Editor(canvas, { elements: initial });
    editorRef.current = editor;
    if (process.env.NODE_ENV !== "production") window.__editor = editor;

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
    canvas.addEventListener("dblclick", preventDefault);
    canvas.addEventListener("contextmenu", preventDefault);

    return () => {
      ro.disconnect();
      dprQuery?.removeEventListener("change", onDpr);
      canvas.removeEventListener("touchstart", preventDefault);
      canvas.removeEventListener("touchmove", preventDefault);
      canvas.removeEventListener("gesturestart", preventDefault);
      canvas.removeEventListener("dblclick", preventDefault);
      canvas.removeEventListener("contextmenu", preventDefault);
      editor.destroy();
      if (window.__editor === editor) delete window.__editor;
      editorRef.current = null;
    };
  }, [initial]);

  const pickColor = (c: string) => {
    setColor(c);
    editorRef.current?.setColor(c);
  };
  const pickSize = (s: number) => {
    setSize(s);
    editorRef.current?.setSize(s);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar color={color} size={size} onColor={pickColor} onSize={pickSize} />
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
      </div>
    </div>
  );
}
