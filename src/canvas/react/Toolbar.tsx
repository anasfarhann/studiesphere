"use client";

import { useRef, type ReactNode } from "react";
import { t, type en } from "@/i18n/en";
import { Icon, type IconName } from "@/ui/icons";
import type { ToolId } from "../tools/tool";

export const INK_COLORS: ReadonlyArray<{ value: string; label: keyof typeof en }> = [
  { value: "#111827", label: "colorBlack" },
  { value: "#2563eb", label: "colorBlue" },
  { value: "#dc2626", label: "colorRed" },
  { value: "#16a34a", label: "colorGreen" },
  { value: "#ea580c", label: "colorOrange" },
  { value: "#7c3aed", label: "colorPurple" },
  { value: "#facc15", label: "colorYellow" },
];

export const PEN_SIZES: ReadonlyArray<{ value: number; label: keyof typeof en }> = [
  { value: 2, label: "sizeThin" },
  { value: 4, label: "sizeMedium" },
  { value: 8, label: "sizeThick" },
];

export interface ToolbarProps {
  tool: ToolId;
  onTool: (id: ToolId) => void;
  color: string;
  size: number;
  onColor: (c: string) => void;
  onSize: (s: number) => void;
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
const swatchBtn = `${base} h-11 rounded-[18px] text-ink aria-pressed:shadow-[inset_0_0_0_2px_#1B1A1F]`;
const clusterBtn = `${base} size-11 bg-card text-ink ${SHADOW}`;
const Divider = () => <span aria-hidden="true" className="mx-1.5 h-7 w-px shrink-0 bg-[#E8E1DA]" />;

/**
 * The canvas top bar, floating over the drawing: title pill, tool pill, undo/redo/history and
 * save status. The bar itself ignores pointer events so strokes can start between the pills.
 */
export function Toolbar({ tool, onTool, color, size, onColor, onSize, canUndo, canRedo, onUndo, onRedo, onPhoto, onFile, onRecord, recordDisabled, onHistory, left, status }: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const anyFileRef = useRef<HTMLInputElement>(null);
  return (
    <div
      data-testid="canvas-topbar"
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex touch-manipulation flex-wrap items-start justify-between gap-3 p-3"
    >
      <div className="pointer-events-auto min-w-0 max-w-full">{left}</div>
      <div className="pointer-events-none order-last flex w-full justify-center 2xl:order-none 2xl:w-auto">
        <div
          role="toolbar"
          aria-label={t("drawingTools")}
          className={`pointer-events-auto flex max-w-full touch-manipulation items-center gap-1 overflow-x-auto rounded-[28px] bg-card p-1.5 ${SHADOW}`}
        >
          {TOOLS.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={tool === x.id}
              aria-label={t(x.label)}
              title={t(x.label)}
              onClick={() => onTool(x.id)}
              className={toolBtn}
            >
              <Icon name={x.icon} size={20} />
            </button>
          ))}
          <Divider />
          <div role="group" aria-label={t("inkColors")} className="flex shrink-0 items-center">
            {INK_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={t(c.label)}
                title={t(c.label)}
                aria-pressed={color === c.value}
                onClick={() => onColor(c.value)}
                className={`${swatchBtn} w-9`}
              >
                <span className="block size-[22px] rounded-full" style={{ backgroundColor: c.value }} />
              </button>
            ))}
          </div>
          <Divider />
          <div role="group" aria-label={t("penSizes")} className="flex shrink-0 items-center">
            {PEN_SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                aria-label={t(s.label)}
                title={t(s.label)}
                aria-pressed={size === s.value}
                onClick={() => onSize(s.value)}
                className={`${swatchBtn} w-10`}
              >
                <span className="block rounded-full bg-ink" style={{ width: s.value * 2 + 2, height: s.value * 2 + 2 }} />
              </button>
            ))}
          </div>
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
