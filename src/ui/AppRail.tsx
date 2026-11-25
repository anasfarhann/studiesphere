"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { NewPageForm } from "@/features/library/NewPageForm";
import { t } from "@/i18n/en";
import { Icon, type IconName } from "./icons";

export type RailAccount = { email: string; signOut: () => void | Promise<void> };

const btn = "flex size-11 md:size-[52px] shrink-0 items-center justify-center rounded-full";
const idle = "bg-card text-ink";
const on = "bg-ink text-white";

function NavLink({ href, label, icon, active }: { href: string; label: string; icon: IconName; active: boolean }) {
  return (
    <Link href={href} aria-label={label} aria-current={active ? "page" : undefined} className={`${btn} ${active ? on : idle}`}>
      <Icon name={icon} />
    </Link>
  );
}

function Soon({ label, icon }: { label: string; icon: IconName }) {
  return (
    <button type="button" disabled aria-label={label} title={label} className={`${btn} ${idle} cursor-not-allowed opacity-60`}>
      <Icon name={icon} />
    </button>
  );
}

/** Left rail on >= md, bottom bar below. Sign-out lives in the Settings popover. */
export function AppRail({ active, account }: { active: "home" | "subjects"; account?: RailAccount }) {
  const [open, setOpen] = useState(false);
  const popId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = popRef.current?.querySelector<HTMLElement>("button, a[href], input");
    (first ?? popRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);
  return (
    <nav
      aria-label={t("navMain")}
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around gap-1 rounded-t-[28px] bg-panel px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:sticky md:inset-auto md:top-5 md:h-[calc(100dvh-2.5rem)] md:w-[84px] md:shrink-0 md:flex-col md:justify-start md:gap-3.5 md:self-start md:rounded-[28px] md:px-3.5 md:py-5"
    >
      <Link
        href="/app"
        aria-label={t("navHomeLogo")}
        className="hidden size-[52px] items-center justify-center rounded-[18px] bg-ink text-white md:mb-4 md:flex"
      >
        <Icon name="logo" size={26} />
      </Link>
      <NewPageForm variant="rail" className={`${btn} cursor-pointer bg-ink text-white disabled:cursor-not-allowed disabled:opacity-50`} />
      {/* Home and Subjects pointed at the same place, so they are one item (keeps six items inside 320 px). */}
      <NavLink href="/app" label={t("navHome")} icon="home" active={active === "home" || active === "subjects"} />
      <Soon label={t("navTimetableSoon")} icon="calendar" />
      <Soon label={t("navFlashcardsSoon")} icon="cards" />
      <Soon label={t("navQuizSoon")} icon="trophy" />
      <div className="relative md:mt-auto">
        <button
          type="button"
          aria-label={t("navSettings")}
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          ref={triggerRef}
          onClick={() => setOpen((o) => !o)}
          className={`${btn} ${idle}`}
        >
          <Icon name="settings" />
        </button>
        {open && (
          <div
            id={popId}
            ref={popRef}
            tabIndex={-1}
            role="group"
            aria-label={t("navAccount")}
            className="absolute right-0 bottom-full z-40 mb-2 flex w-60 flex-col gap-3 rounded-3xl bg-card p-4 shadow-[0_8px_28px_rgba(27,26,31,0.12)] md:right-auto md:bottom-0 md:left-full md:mb-0 md:ml-3"
          >
            {account ? (
              <>
                <span className="truncate text-sm text-muted">{account.email}</span>
                <form action={account.signOut}>
                  <button type="submit" className="h-11 w-full cursor-pointer rounded-full bg-ink px-4 text-sm font-medium text-white">
                    {t("signOut")}
                  </button>
                </form>
              </>
            ) : (
              <span className="text-sm text-muted">{t("navSettings")}</span>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
