"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { t } from "@/i18n/en";
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from "../color/hsv";

const SIZE = 248;
const RING = 44;
const OUTER = SIZE / 2;
const INNER = OUTER - RING;
const SQUARE = 108;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

type Drag = "hue" | "sv" | null;

/**
 * Hue ring + saturation/value square + hex field. Pointer events (mouse, touch, Apple Pencil) with
 * capture, arrow keys on the focusable ring and square, no dependencies. `value` is `#rrggbb`.
 */
export function ColorWheel({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value) ?? { h: 0, s: 1, v: 1 });
  const [draft, setDraft] = useState<string | null>(null);
  const drag = useRef<Drag>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);

  // A colour set from outside (preset tap, hex typed) resyncs the handles; hue survives greys and black.
  if (value.toLowerCase() !== hsvToHex(hsv.h, hsv.s, hsv.v)) {
    const n = hexToHsv(value);
    if (n) setHsv({ h: n.s === 0 || n.v === 0 ? hsv.h : n.h, s: n.s, v: n.v });
  }

  const apply = (next: Hsv) => {
    setHsv(next);
    setDraft(null);
    onChange(hsvToHex(next.h, next.s, next.v));
  };

  const hueAt = (e: PointerEvent) => {
    const r = ringRef.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return { deg: ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360, dist: Math.hypot(dx, dy), outer: r.width / 2 || OUTER };
  };
  const svAt = (e: PointerEvent): Pick<Hsv, "s" | "v"> => {
    const r = squareRef.current!.getBoundingClientRect();
    return { s: clamp01((e.clientX - r.left) / (r.width || 1)), v: 1 - clamp01((e.clientY - r.top) / (r.height || 1)) };
  };

  const capture = (e: PointerEvent, kind: Drag) => {
    drag.current = kind;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Synthetic pointers can't be captured; moves still arrive while over the element.
    }
  };
  const release = (e: PointerEvent) => {
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // Already released.
    }
  };

  const ringDown = (e: PointerEvent) => {
    if (e.button > 0) return;
    const p = hueAt(e);
    if (p.dist > p.outer) return; // the box corners outside the ring
    e.preventDefault();
    capture(e, "hue");
    apply({ ...hsv, h: p.deg });
  };
  const ringMove = (e: PointerEvent) => {
    if (drag.current === "hue") apply({ ...hsv, h: hueAt(e).deg });
  };
  const squareDown = (e: PointerEvent) => {
    if (e.button > 0) return;
    e.preventDefault();
    capture(e, "sv");
    apply({ ...hsv, ...svAt(e) });
  };
  const squareMove = (e: PointerEvent) => {
    if (drag.current === "sv") apply({ ...hsv, ...svAt(e) });
  };

  const ringKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? step : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : 0;
    if (!d) return;
    e.preventDefault();
    apply({ ...hsv, h: (hsv.h + d + 360) % 360 });
  };
  const squareKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    let { s, v } = hsv;
    if (e.key === "ArrowRight") s += step;
    else if (e.key === "ArrowLeft") s -= step;
    else if (e.key === "ArrowUp") v += step;
    else if (e.key === "ArrowDown") v -= step;
    else return;
    e.preventDefault();
    apply({ ...hsv, s: clamp01(s), v: clamp01(v) });
  };

  const rad = (hsv.h * Math.PI) / 180;
  const mid = (OUTER + INNER) / 2;
  const hueX = OUTER + Math.sin(rad) * mid;
  const hueY = OUTER - Math.cos(rad) * mid;
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const pointStyle = (x: number, y: number, fill: string) => ({ left: x, top: y, backgroundColor: fill });
  const pointCls = "pointer-events-none absolute size-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1.5px_#1B1A1F]";
  const focusCls = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <div
          ref={ringRef}
          role="slider"
          tabIndex={0}
          aria-label={t("colorHue")}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={Math.round(hsv.h) % 360}
          onPointerDown={ringDown}
          onPointerMove={ringMove}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={ringKey}
          className={`absolute inset-0 rounded-full ${focusCls}`}
          style={{
            touchAction: "none",
            background: "conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
            WebkitMaskImage: `radial-gradient(circle, transparent ${INNER - 1}px, #000 ${INNER}px)`,
            maskImage: `radial-gradient(circle, transparent ${INNER - 1}px, #000 ${INNER}px)`,
          }}
        />
        <span aria-hidden className={pointCls} style={pointStyle(hueX, hueY, hsvToHex(hsv.h, 1, 1))} />
        <div
          ref={squareRef}
          role="slider"
          tabIndex={0}
          aria-label={t("colorSaturationValue")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.s * 100)}
          aria-valuetext={t("colorSvText", { s: Math.round(hsv.s * 100), v: Math.round(hsv.v * 100) })}
          onPointerDown={squareDown}
          onPointerMove={squareMove}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={squareKey}
          className={`absolute rounded-lg ${focusCls}`}
          style={{
            touchAction: "none",
            left: (SIZE - SQUARE) / 2,
            top: (SIZE - SQUARE) / 2,
            width: SQUARE,
            height: SQUARE,
            background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, ${hsvToHex(hsv.h, 1, 1)})`,
          }}
        />
        <span aria-hidden className={pointCls} style={pointStyle((SIZE - SQUARE) / 2 + hsv.s * SQUARE, (SIZE - SQUARE) / 2 + (1 - hsv.v) * SQUARE, hex)} />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <span>{t("colorHex")}</span>
        <input
          type="text"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={7}
          value={draft ?? hex}
          onChange={(e) => {
            const text = e.currentTarget.value;
            setDraft(text);
            const n = normalizeHex(text);
            if (n) {
              const c = hexToHsv(n)!;
              setHsv({ h: c.s === 0 || c.v === 0 ? hsv.h : c.h, s: c.s, v: c.v });
              onChange(n);
            }
          }}
          onBlur={() => setDraft(null)}
          className="h-11 w-28 rounded-xl border border-hairline bg-ground px-3 font-mono text-ink"
        />
      </label>
    </div>
  );
}
