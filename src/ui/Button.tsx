import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./icons";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "dark" | "light"; icon?: IconName };

export function PillButton({ variant = "dark", icon, className, children, type = "button", ...rest }: PillProps) {
  return (
    <button
      type={type}
      {...rest}
      className={cx(
        "inline-flex h-12 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full px-5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
        variant === "dark" ? "bg-ink text-white" : "bg-card text-ink",
        className,
      )}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  icon: IconName;
  label: string;
  active?: boolean;
  size?: 44 | 52;
};

export function IconButton({ icon, label, active, size = 44, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      className={cx(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50",
        size === 52 ? "size-[52px]" : "size-11",
        active ? "bg-ink text-white" : "bg-card text-ink",
        className,
      )}
    >
      <Icon name={icon} size={size === 52 ? 22 : 20} />
    </button>
  );
}
