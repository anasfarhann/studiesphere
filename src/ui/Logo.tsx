import { useId } from "react";

/** The "Orbit S" stroke width (viewBox units) grows at small sizes so the mark stays legible. */
export function logoStrokeWidth(size: number): number {
  if (size <= 16) return 15;
  if (size <= 32) return 13;
  if (size <= 48) return 12;
  return 11;
}

export const LOGO_STOPS = [
  { offset: "0", color: "#D9D2FF" },
  { offset: "0.5", color: "#A597F4" },
  { offset: "1", color: "#6E5CD8" },
] as const;
export const LOGO_RING = { cx: 50, cy: 50, r: 40 } as const;
export const LOGO_S_PATH = "M50 10 A20 20 0 0 0 50 50 A20 20 0 0 1 50 90";

/** Studiesphere mark: a ring with an S running through it, soft purple gradient. Decorative unless `title` is set. */
export function LogoMark({ size = 32, className, title }: { size?: number; className?: string; title?: string }) {
  // useId returns ":r0:"-style ids; strip the colons so `url(#…)` stays a plain reference.
  const gradientId = `logo-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const stroke = `url(#${gradientId})`;
  const width = logoStrokeWidth(size);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
    >
      <defs>
        <linearGradient id={gradientId} x1="82" y1="12" x2="18" y2="88" gradientUnits="userSpaceOnUse">
          {LOGO_STOPS.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <circle {...LOGO_RING} fill="none" stroke={stroke} strokeWidth={width} />
      <path d={LOGO_S_PATH} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="butt" />
    </svg>
  );
}

/** Mark + lowercase "studiesphere" (DM Sans 600, tight tracking). */
export function Wordmark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`} style={{ gap: Math.round(size * 0.3) }}>
      <LogoMark size={size} />
      <span className="leading-none font-semibold tracking-[-0.035em]" style={{ fontSize: Math.round(size * 0.74) }}>
        studiesphere
      </span>
    </span>
  );
}
