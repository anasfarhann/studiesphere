import type { HTMLAttributes } from "react";

/** Rounded surface. `tint` is a pastel hex; omit for a white card. */
export function Card({
  tint,
  className,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tint?: string }) {
  return (
    <div
      {...rest}
      style={tint ? { background: tint, ...style } : style}
      className={`rounded-3xl p-5 ${tint ? "" : "bg-card"} ${className ?? ""}`}
    />
  );
}
