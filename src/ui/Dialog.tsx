"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { t } from "@/i18n/en";
import { IconButton } from "./Button";

/** Modal dialog: traps Tab, closes on Escape or backdrop tap, returns focus to the opener. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const headingId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]") ?? []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeRef.current();
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!ref.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="flex w-full max-w-md flex-col gap-4 rounded-[28px] bg-card p-6 shadow-[0_8px_28px_rgba(27,26,31,0.12)]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={headingId} className="text-xl font-medium">
            {title}
          </h2>
          <IconButton icon="plus" label={t("dashClose")} onClick={onClose} className="rotate-45 bg-panel" />
        </div>
        {children}
      </div>
    </div>
  );
}
