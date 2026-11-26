"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@/i18n/en";
import { ColorWheel } from "./ColorWheel";

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

export interface ColorSwatchesProps {
  presets: string[];
  /** The current colour (`#rrggbb`), or "" when there is none (mixed selection). */
  value: string;
  /** A preset was tapped. */
  onPick: (hex: string) => void;
  /** Live colour-wheel changes (every drag move). */
  onWheelChange: (hex: string) => void;
  /** A colour-wheel change finished (pointer up, key, hex entry). */
  onWheelCommit?: () => void;
  /** Preset editing (long-press to remove, "Add to presets"); omitted, presets are read-only. Each returns the status message. */
  editing?: { isDefault: (hex: string) => boolean; add: (hex: string) => string; remove: (hex: string) => string };
}

/**
 * Preset swatches; tapping the selected swatch opens the colour wheel. Shared by the tool options
 * and the selection menu's Colour.
 */
export function ColorSwatches({ presets, value, onPick, onWheelChange, onWheelCommit, editing }: ColorSwatchesProps) {
  const [wheelOpen, setWheelOpen] = useState(false);
  const [message, setMessage] = useState("");
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  useEffect(
    () => () => {
      if (press.current) clearTimeout(press.current.timer);
    },
    [],
  );

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const removable = (c: string) => editing !== undefined && !editing.isDefault(c);

  return (
    <>
      <div role="group" aria-label={t("colorPresets")} className="flex flex-wrap items-center justify-center">
        {presets.map((c) => {
          const selected = value.toLowerCase() === c.toLowerCase();
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
                if (!editing || !removable(c)) return;
                press.current = {
                  x: e.clientX,
                  y: e.clientY,
                  timer: setTimeout(() => {
                    press.current = null;
                    longPressed.current = true;
                    setMessage(editing.remove(c));
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
              onKeyDown={(e) => {
                if (editing && (e.key === "Delete" || e.key === "Backspace") && removable(c)) {
                  e.preventDefault();
                  setMessage(editing.remove(c));
                }
              }}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => {
                if (longPressed.current) {
                  longPressed.current = false;
                  return;
                }
                if (selected) setWheelOpen((o) => !o);
                else onPick(c);
              }}
              className="inline-flex size-11 shrink-0 touch-manipulation cursor-pointer select-none items-center justify-center rounded-full text-ink aria-pressed:shadow-[inset_0_0_0_2px_#1B1A1F]"
            >
              <span className="block size-[22px] rounded-full border border-hairline" style={{ backgroundColor: c }} />
            </button>
          );
        })}
      </div>
      {wheelOpen && value ? (
        <div role="group" aria-label={t("colorWheelFor")} className="flex flex-col items-center gap-1">
          <ColorWheel value={value} onChange={onWheelChange} onCommit={onWheelCommit} />
          {editing ? (
            <button
              type="button"
              onClick={() => setMessage(editing.add(value))}
              className="inline-flex h-11 touch-manipulation cursor-pointer items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-card"
            >
              {t("colorAdd")}
            </button>
          ) : null}
        </div>
      ) : null}
      {editing ? (
        <p data-testid="preset-message" role="status" aria-live="polite" className="min-h-5 text-center text-xs text-muted">
          {message}
        </p>
      ) : null}
    </>
  );
}
