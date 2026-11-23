"use client";

import { useRef } from "react";
import { t, type en } from "@/i18n/en";
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
  /** Shows the Record button when set; called straight from the tap (microphone prompt needs the gesture). */
  onRecord?: () => void;
  recordDisabled?: boolean;
}

const btn =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-md border border-transparent aria-pressed:border-gray-900 aria-pressed:bg-gray-100";

export function Toolbar({ tool, onTool, color, size, onColor, onSize, canUndo, canRedo, onUndo, onRedo, onPhoto, onRecord, recordDisabled }: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div role="toolbar" aria-label={t("drawingTools")} className="flex flex-wrap items-center gap-2 border-b px-3 py-1">
      <button
        type="button"
        aria-pressed={tool === "pen"}
        aria-label={t("toolPen")}
        onClick={() => onTool("pen")}
        className={`${btn} px-3 text-sm`}
      >
        {t("toolPen")}
      </button>
      <button
        type="button"
        aria-pressed={tool === "highlighter"}
        aria-label={t("toolHighlighter")}
        onClick={() => onTool("highlighter")}
        className={`${btn} px-3 text-sm`}
      >
        {t("toolHighlighter")}
      </button>
      <button
        type="button"
        aria-pressed={tool === "eraser"}
        aria-label={t("toolEraser")}
        onClick={() => onTool("eraser")}
        className={`${btn} px-3 text-sm`}
      >
        {t("toolEraser")}
      </button>
      <button
        type="button"
        aria-pressed={tool === "text"}
        aria-label={t("toolText")}
        onClick={() => onTool("text")}
        className={`${btn} px-3 text-sm`}
      >
        {t("toolText")}
      </button>
      <button
        type="button"
        aria-pressed={tool === "lasso"}
        aria-label={t("toolLasso")}
        onClick={() => onTool("lasso")}
        className={`${btn} px-3 text-sm`}
      >
        {t("toolLasso")}
      </button>
      <button
        type="button"
        aria-pressed={tool === "hand"}
        aria-label={t("toolHand")}
        onClick={() => onTool("hand")}
        className={`${btn} px-3 text-sm`}
      >
        {t("toolHand")}
      </button>
      {onPhoto ? (
        <>
          {/* click() runs inside the tap handler: iPad Safari only opens the picker from a user gesture. */}
          <button type="button" aria-label={t("toolPhoto")} onClick={() => fileRef.current?.click()} className={`${btn} px-3 text-sm`}>
            {t("toolPhoto")}
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
        <button type="button" aria-label={t("toolRecord")} disabled={recordDisabled} onClick={onRecord} className={`${btn} px-3 text-sm disabled:opacity-40`}>
          {t("toolRecord")}
        </button>
      ) : null}
      <button type="button" aria-label={t("undo")} disabled={!canUndo} onClick={onUndo} className={`${btn} px-3 text-sm disabled:opacity-40`}>
        {t("undo")}
      </button>
      <button type="button" aria-label={t("redo")} disabled={!canRedo} onClick={onRedo} className={`${btn} px-3 text-sm disabled:opacity-40`}>
        {t("redo")}
      </button>
      <div role="group" aria-label={t("inkColors")} className="flex items-center gap-1">
        {INK_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-label={t(c.label)}
            aria-pressed={color === c.value}
            onClick={() => onColor(c.value)}
            className={btn}
          >
            <span className="block h-6 w-6 rounded-full" style={{ backgroundColor: c.value }} />
          </button>
        ))}
      </div>
      <div role="group" aria-label={t("penSizes")} className="flex items-center gap-1">
        {PEN_SIZES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-label={t(s.label)}
            aria-pressed={size === s.value}
            onClick={() => onSize(s.value)}
            className={btn}
          >
            <span className="block rounded-full bg-gray-900" style={{ width: s.value * 2, height: s.value * 2 }} />
          </button>
        ))}
      </div>
    </div>
  );
}
