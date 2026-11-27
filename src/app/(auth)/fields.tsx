"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { t } from "@/i18n/en";
import { Icon, type IconName } from "@/ui/icons";

/**
 * Bordered field with a leading icon. Resting: 1.5px border (3:1 against the field) on the warm field
 * fill; focused: the 2px ink border, white fill and 4px lavender ring from the mockup.
 */
const shell =
  "flex h-[52px] items-center gap-2.5 rounded-2xl border-[1.5px] border-field-line bg-field pl-3.5 text-muted transition-[box-shadow,border-color] focus-within:border-2 focus-within:border-ink focus-within:bg-card focus-within:text-ink focus-within:ring-4 focus-within:ring-lavender lg:h-[54px] lg:pl-4";
const input =
  "h-full min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-none placeholder:text-muted lg:text-[15px]";

function FieldShell({ icon, children, className = "" }: { icon: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={`${shell} ${className}`}>
      <Icon name={icon} size={18} className="shrink-0" />
      {children}
    </span>
  );
}

export function EmailField({ autoFocus }: { autoFocus?: boolean }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {t("email")}
      <FieldShell icon="mail" className="pr-3.5">
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus={autoFocus}
          placeholder={t("emailPlaceholder")}
          className={input}
        />
      </FieldShell>
    </label>
  );
}

export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  minLength,
  placeholder = t("passwordPlaceholder"),
  aside,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  placeholder?: string;
  /** Shown at the end of the label row (e.g. the "Forgot password?" link). */
  aside?: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {aside}
      </div>
      <FieldShell icon="lock" className="pr-1">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={input}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          // A toggle button keeps one name; aria-pressed carries the state.
          aria-label={t("showPassword")}
          aria-pressed={shown}
          aria-controls={id}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
        >
          <Icon name={shown ? "eyeOff" : "eye"} size={18} />
        </button>
      </FieldShell>
    </div>
  );
}

export function FormHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-1 flex flex-col gap-1.5 lg:mb-2 lg:gap-2">
      <h1 id="auth-heading" className="m-0 text-[30px] leading-tight font-semibold tracking-[-0.025em] lg:text-4xl">
        {title}
      </h1>
      <p className="m-0 text-[15px] text-muted">{subtitle}</p>
    </div>
  );
}

export function FormMessages({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <>
      {error && (
        <p role="alert" className="m-0 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="m-0 rounded-2xl bg-mint px-4 py-3 text-sm">
          {notice}
        </p>
      )}
    </>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="mt-1 flex h-[54px] cursor-pointer items-center justify-center gap-2.5 rounded-full bg-ink px-5 text-base font-semibold text-white shadow-[0_10px_24px_rgb(27_26_31/0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50 lg:mt-1.5 lg:h-14 lg:shadow-[0_12px_28px_rgb(27_26_31/0.2)]"
    >
      {children}
      <Icon name="arrowRight" size={18} />
    </button>
  );
}

/** "Forgot password?" link that sits next to the Password label. */
export function ForgotLink() {
  return (
    <Link
      href="/forgot-password"
      className="-my-3 flex min-h-11 items-center text-[13px] text-muted underline-offset-2 hover:text-ink hover:underline"
    >
      {t("forgotPasswordLink")}
    </Link>
  );
}

/** Divider with a prompt, then a full-width secondary link (e.g. "New to Studiesphere?" → "Create a free account"). */
export function AltAction({ prompt, href, label }: { prompt: string; href: string; label: string }) {
  return (
    <div className="flex flex-col gap-3 lg:gap-[18px]">
      <div className="flex items-center gap-3 text-[13px] text-muted">
        <span className="h-px flex-1 bg-divider" />
        {prompt}
        <span className="h-px flex-1 bg-divider" />
      </div>
      <Link
        href={href}
        className="flex h-[50px] items-center justify-center rounded-full bg-ground text-[15px] font-semibold text-ink no-underline hover:bg-panel focus-visible:outline-2 focus-visible:outline-ink lg:h-[52px]"
      >
        {label}
      </Link>
    </div>
  );
}
