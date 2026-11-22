"use client";

import { t, type en } from "@/i18n/en";

export const INK_COLORS: ReadonlyArray<{ value: string; label: keyof typeof en }> = [
  { value: "#111827", label: "colorBlack" },
  { value: "#2563eb", label: "colorBlue" },
  { value: "#dc2626", label: "colorRed" },
  { value: "#16a34a", label: "colorGreen" },
  { value: "#ea580c", label: "colorOrange" },
  { value: "#7c3aed", label: "colorPurple" },
];

export const PEN_SIZES: ReadonlyArray<{ value: number; label: keyof typeof en }> = [
  { value: 2, label: "sizeThin" },
  { value: 4, label: "sizeMedium" },
  { value: 8, label: "sizeThick" },
];

export interface ToolbarProps {
  color: string;
  size: number;
  onColor: (c: string) => void;
  onSize: (s: number) => void;
}

const btn =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-md border border-transparent aria-pressed:border-gray-900 aria-pressed:bg-gray-100";

export function Toolbar({ color, size, onColor, onSize }: ToolbarProps) {
  return (
    <div role="toolbar" aria-label={t("drawingTools")} className="flex flex-wrap items-center gap-2 border-b px-3 py-1">
      <button type="button" aria-pressed="true" aria-label={t("toolPen")} className={`${btn} px-3 text-sm`}>
        {t("toolPen")}
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
