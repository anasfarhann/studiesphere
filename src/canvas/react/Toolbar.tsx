"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { t, type en } from "@/i18n/en";
import { Icon, type IconName } from "@/ui/icons";
import type { ToolId } from "../tools/tool";
import { hasOptions } from "./ToolOptions";

export interface ToolbarProps {
  tool: ToolId;
  onTool: (id: ToolId) => void;
  /** Content of the tool-options popover (shown on tapping the already-active pen, highlighter, eraser or text tool). */
  renderOptions?: (tool: ToolId) => ReactNode;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Shows the Photo button when set; called with the picked (or camera) image. */
  onPhoto?: (file: File) => void;
  /** Shows the File button when set; called with the picked file (any type). */
  onFile?: (file: File) => void;
  /** Shows the Record button when set; called straight from the tap (microphone prompt needs the gesture). */
  onRecord?: () => void;
  recordDisabled?: boolean;
  /** Shows the Page history button when set. */
  onHistory?: () => void;
  /** Left of the bar: the title pill (back link, page title, subject and notebook). */
  left?: ReactNode;
  /** Right of the bar, after undo/redo/history: the save status pill. */
  status?: ReactNode;
  /** The bar element, so the host can measure it (panels sit below it). */
  barRef?: Ref<HTMLDivElement>;
}

const TOOLS: ReadonlyArray<{ id: ToolId; icon: IconName; label: keyof typeof en }> = [
  { id: "pen", icon: "pen", label: "toolPen" },
  { id: "highlighter", icon: "highlighter", label: "toolHighlighter" },
  { id: "eraser", icon: "eraser", label: "toolEraser" },
  { id: "lasso", icon: "lasso", label: "toolLasso" },
  { id: "text", icon: "text", label: "toolText" },
  { id: "hand", icon: "hand", label: "toolHand" },
];

const SHADOW = "shadow-[0_8px_28px_rgba(27,26,31,0.10)]";
const base = "inline-flex shrink-0 touch-manipulation cursor-pointer items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40";
const toolBtn = `${base} size-11 text-ink aria-pressed:bg-ink aria-pressed:text-white`;
const insertBtn = `${base} size-11 bg-ground text-ink`;
const clusterBtn = `${base} size-11 bg-card text-ink ${SHADOW}`;
const Divider = () => <span aria-hidden="true" className="mx-1.5 h-7 w-px shrink-0 bg-hairline" />;

/**
 * The canvas top bar, floating over the drawing: title pill, tool pill, undo/redo/history and
 * save status. The bar itself ignores pointer events so strokes can start between the pills.
 */
export function Toolbar({ tool, onTool, renderOptions, canUndo, canRedo, onUndo, onRedo, onPhoto, onFile, onRecord, recordDisabled, onHistory, left, status, barRef }: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const anyFileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);
  const showOptions = open && !!renderOptions && hasOptions(tool);
  useEffect(() => {
    if (!showOptions) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!popRef.current?.contains(n) && !triggerRef.current?.contains(n)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [showOptions, close]);
  const pick = (id: ToolId) => {
    if (id === tool && renderOptions && hasOptions(id)) {
      setOpen((v) => !v);
      return;
    }
    setOpen(false);
    onTool(id);
  };

  return (
    <div
      ref={barRef}
      data-testid="canvas-topbar"
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex touch-manipulation flex-wrap items-start justify-between gap-3 p-3"
    >
      <div className="pointer-events-auto min-w-0 max-w-full">{left}</div>
      <div className="pointer-events-none order-last flex w-full justify-center 2xl:order-none 2xl:w-auto">
        <div
          role="toolbar"
          aria-label={t("drawingTools")}
          className={`pointer-events-auto relative flex max-w-full touch-manipulation flex-wrap items-center justify-center gap-1 rounded-[28px] bg-card p-1.5 ${SHADOW}`}
        >
          {TOOLS.map((x) => (
            <button
              key={x.id}
              ref={tool === x.id ? triggerRef : undefined}
              type="button"
              aria-pressed={tool === x.id}
              aria-haspopup={hasOptions(x.id) ? "true" : undefined}
              aria-expanded={tool === x.id && hasOptions(x.id) ? showOptions : undefined}
              aria-controls={tool === x.id && showOptions ? "tool-options" : undefined}
              aria-label={t(x.label)}
              title={t(x.label)}
              onClick={() => pick(x.id)}
              className={toolBtn}
            >
              <Icon name={x.icon} size={20} />
            </button>
          ))}
          {onPhoto || onFile || onRecord ? <Divider /> : null}
          {onPhoto ? (
            <>
              {/* click() runs inside the tap handler: iPad Safari only opens the picker from a user gesture. */}
              <button type="button" aria-label={t("toolPhoto")} title={t("toolPhoto")} onClick={() => fileRef.current?.click()} className={insertBtn}>
                <Icon name="photo" size={20} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                data-testid="photo-input"
                aria-label={t("photoPickerLabel")}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onPhoto(file);
                }}
              />
            </>
          ) : null}
          {onRecord ? (
            <button type="button" aria-label={t("toolRecord")} title={t("toolRecord")} disabled={recordDisabled} onClick={onRecord} className={insertBtn}>
              <Icon name="mic" size={20} />
            </button>
          ) : null}
          {onFile ? (
            <>
              <button type="button" aria-label={t("toolFile")} title={t("toolFile")} onClick={() => anyFileRef.current?.click()} className={insertBtn}>
                <Icon name="paperclip" size={20} />
              </button>
              <input
                ref={anyFileRef}
                type="file"
                hidden
                data-testid="file-input"
                aria-label={t("filePickerLabel")}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onFile(file);
                }}
              />
            </>
          ) : null}
          {showOptions ? (
            <div
              ref={popRef}
              id="tool-options"
              role="group"
              aria-label={t("toolOptions", { tool: t(TOOLS.find((x) => x.id === tool)?.label ?? "toolPen") })}
              className={`absolute top-full left-1/2 z-30 mt-2 flex max-h-[calc(100dvh-140px)] w-[min(332px,calc(100vw-24px))] overflow-y-auto overscroll-contain -translate-x-1/2 flex-col items-center gap-1 rounded-[28px] bg-card p-1.5 ${SHADOW}`}
            >
              {renderOptions?.(tool)}
            </div>
          ) : null}
        </div>
      </div>
      <div className="pointer-events-auto flex max-w-full shrink-0 items-center gap-2">
        <button type="button" aria-label={t("undo")} title={t("undo")} disabled={!canUndo} onClick={onUndo} className={clusterBtn}>
          <Icon name="undo" size={20} />
        </button>
        <button type="button" aria-label={t("redo")} title={t("redo")} disabled={!canRedo} onClick={onRedo} className={clusterBtn}>
          <Icon name="redo" size={20} />
        </button>
        {onHistory ? (
          <button type="button" aria-label={t("toolHistory")} title={t("toolHistory")} onClick={onHistory} className={clusterBtn}>
            <Icon name="history" size={20} />
          </button>
        ) : null}
        {status}
      </div>
    </div>
  );
}
