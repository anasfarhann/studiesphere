"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { t } from "@/i18n/en";
import type { Editor } from "../editor";
import { addPreset, clampSize, DEFAULT_SETTINGS, MAX_PRESET_COUNT, removePreset, SIZE_RANGE, type StrokeToolId, type ToolSettings } from "../settings/tool-settings";
import { ColorWheel } from "./ColorWheel";

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

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

/** Size slider, colour presets and colour wheel for one tool, bound to the editor's settings. */
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

  const presetTool: StrokeToolId = tool === "highlighter" ? "highlighter" : "pen";
  const [wheelOpen, setWheelOpen] = useState(false);
  const [message, setMessage] = useState("");
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  const [shownTool, setShownTool] = useState(tool);
  if (shownTool !== tool) {
    setShownTool(tool);
    setWheelOpen(false);
    setMessage("");
  }
  useEffect(
    () => () => {
      if (press.current) clearTimeout(press.current.timer);
    },
    [],
  );

  const setSize = (n: number) => {
    const v = clampSize(tool, n);
    editor.updateSettings((cur) => ({ ...cur, [tool]: { ...cur[tool], size: v } }), { deferSave: true });
  };
  const setColor = (c: string) => {
    editor.updateSettings((cur) => ({ ...cur, [tool]: { ...cur[tool], color: c } }));
  };
  const has = (c: string) => presets.some((p) => p.toLowerCase() === c.toLowerCase());
  const full = presets.length >= MAX_PRESET_COUNT;

  const addCurrent = () => {
    if (has(color)) return setMessage(t("colorAlready"));
    if (full) return setMessage(t("colorFull"));
    editor.updateSettings((cur) => addPreset(cur, presetTool, color));
    setMessage(t("colorAdded", { hex: color }));
  };
  const removeAt = (c: string) => {
    editor.updateSettings((cur) => {
      const next = removePreset(cur, presetTool, c);
      // Text follows the pen presets, so a removed colour falls back to the tool's first default.
      const fallback = DEFAULT_SETTINGS[presetTool].presets[0];
      const swap = (v: string) => (v.toLowerCase() === c.toLowerCase() ? fallback : v);
      return { ...next, [tool]: { ...next[tool], color: swap((next[tool] as { color: string }).color) } } as ToolSettings;
    });
    setMessage(t("colorRemoved", { hex: c }));
  };
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const isDefault = (c: string) => DEFAULT_SETTINGS[presetTool].presets.some((d) => d.toLowerCase() === c.toLowerCase());

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
          onPointerUp={() => editor.flushSettings()}
          onKeyUp={() => editor.flushSettings()}
          onBlur={() => editor.flushSettings()}
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
        <>
          <div role="group" aria-label={t("colorPresets")} className="flex flex-wrap items-center justify-center">
            {presets.map((c) => {
              const selected = color.toLowerCase() === c.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={t("colorPreset", { hex: c })}
                  title={t("colorPreset", { hex: c })}
                  aria-pressed={selected}
                  aria-expanded={selected ? wheelOpen : undefined}
                  onPointerDown={(e) => {
                    longPressed.current = false;
                    cancelPress();
                    if (isDefault(c)) return;
                    press.current = {
                      x: e.clientX,
                      y: e.clientY,
                      timer: setTimeout(() => {
                        press.current = null;
                        longPressed.current = true;
                        removeAt(c);
                      }, LONG_PRESS_MS),
                    };
                  }}
                  onPointerMove={(e) => {
                    const p = press.current;
                    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP) cancelPress();
                  }}
                  onPointerUp={cancelPress}
                  onPointerLeave={cancelPress}
                  onPointerCancel={cancelPress}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => {
                    if (longPressed.current) {
                      longPressed.current = false;
                      return;
                    }
                    if (selected) setWheelOpen((o) => !o);
                    else setColor(c);
                  }}
                  className="inline-flex size-11 shrink-0 touch-manipulation cursor-pointer select-none items-center justify-center rounded-full text-ink aria-pressed:shadow-[inset_0_0_0_2px_#1B1A1F]"
                >
                  <span className="block size-[22px] rounded-full border border-hairline" style={{ backgroundColor: c }} />
                </button>
              );
            })}
          </div>
          {wheelOpen ? (
            <div role="group" aria-label={t("colorWheelFor")} className="flex flex-col items-center gap-1">
              <ColorWheel value={color} onChange={setColor} />
              <button
                type="button"
                onClick={addCurrent}
                className="inline-flex h-11 touch-manipulation cursor-pointer items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-card disabled:opacity-50"
                disabled={has(color) || full}
              >
                {t("colorAdd")}
              </button>
            </div>
          ) : null}
          <p data-testid="preset-message" role="status" aria-live="polite" className="min-h-5 text-center text-xs text-muted">
            {message}
          </p>
        </>
      ) : null}
    </div>
  );
}
