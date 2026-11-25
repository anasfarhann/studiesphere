"use client";

import { useSyncExternalStore } from "react";
import { t } from "@/i18n/en";
import type { Editor } from "../editor";
import { clampSize, SIZE_RANGE, type ToolSettings } from "../settings/tool-settings";

export type OptionsToolId = keyof typeof SIZE_RANGE;
export const OPTION_TOOLS: ReadonlyArray<string> = ["pen", "highlighter", "eraser", "text"];
export const hasOptions = (id: string): id is OptionsToolId => OPTION_TOOLS.includes(id);

const SIZE_LABEL = { pen: "sizePen", highlighter: "sizeHighlighter", eraser: "sizeEraser", text: "sizeText" } as const;

/** Text colours come from the pen presets. */
function presetsFor(s: ToolSettings, tool: OptionsToolId): string[] {
  if (tool === "pen" || tool === "text") return s.pen.presets;
  if (tool === "highlighter") return s.highlighter.presets;
  return [];
}

/** Size slider (and, for now, a plain row of colour presets) for one tool, bound to the editor's settings. */
export function ToolOptions({ editor, tool }: { editor: Editor; tool: OptionsToolId }) {
  const s = useSyncExternalStore(
    (cb) => editor.onSettingsChange(cb),
    () => editor.settings,
    () => editor.settings,
  );
  const size = s[tool].size;
  const [min, max] = SIZE_RANGE[tool];
  const hasColor = tool !== "eraser";
  const color = tool === "eraser" ? "" : s[tool].color;
  const presets = presetsFor(s, tool);

  const setSize = (n: number) => {
    const v = clampSize(tool, n);
    editor.updateSettings((cur) => ({ ...cur, [tool]: { ...cur[tool], size: v } }));
  };
  const setColor = (c: string) => {
    editor.updateSettings((cur) => ({ ...cur, [tool]: { ...cur[tool], color: c } }));
  };

  return (
    <div className="flex w-full flex-col gap-1 px-2 py-1">
      <div className="flex items-center gap-3">
        <input
          type="range"
          aria-label={t(SIZE_LABEL[tool])}
          min={min}
          max={max}
          step={1}
          value={size}
          onChange={(e) => setSize(e.currentTarget.valueAsNumber)}
          className="h-11 min-w-0 flex-1 cursor-pointer touch-manipulation accent-ink"
        />
        <output className="w-14 shrink-0 text-right text-sm tabular-nums text-ink">{t("sizePx", { n: size })}</output>
      </div>
      {tool === "pen" || tool === "highlighter" ? (
        <div aria-label={t("sizePreview")} role="img" className="flex h-16 items-center justify-center overflow-hidden rounded-2xl bg-ground">
          <span
            data-testid="size-preview"
            className="block shrink-0 rounded-full"
            style={{ width: size, height: size, backgroundColor: color }}
          />
        </div>
      ) : null}
      {hasColor ? (
        <div role="group" aria-label={t("colorPresets")} className="flex flex-wrap items-center justify-center">
          {presets.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={t("colorPreset", { hex: c })}
              title={t("colorPreset", { hex: c })}
              aria-pressed={color.toLowerCase() === c.toLowerCase()}
              onClick={() => setColor(c)}
              className="inline-flex size-11 shrink-0 touch-manipulation cursor-pointer items-center justify-center rounded-full text-ink aria-pressed:shadow-[inset_0_0_0_2px_#1B1A1F]"
            >
              <span className="block size-[22px] rounded-full border border-hairline" style={{ backgroundColor: c }} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
