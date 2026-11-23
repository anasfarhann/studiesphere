import type { ButtonHTMLAttributes } from "react";

/** Filter chip with a colour dot; `selected` shows the dark state. */
export function Chip({
  dot,
  selected,
  className,
  children,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { dot?: string; selected?: boolean }) {
  return (
    <button
      type={type}
      role="tab"
      aria-selected={!!selected}
      {...rest}
      className={`inline-flex h-12 max-w-full cursor-pointer items-center gap-2.5 rounded-full pr-5 pl-4 text-sm font-medium ${
        selected ? "bg-ink text-white" : "bg-card text-ink"
      } ${className ?? ""}`}
    >
      {dot && <span className="size-3 shrink-0 rounded-full" style={{ background: dot }} />}
      <span className="truncate">{children}</span>
    </button>
  );
}
