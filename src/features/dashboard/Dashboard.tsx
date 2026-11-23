"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SubjectForm } from "@/features/library/forms";
import { t } from "@/i18n/en";
import { PillButton, IconButton } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { Icon } from "@/ui/icons";
import { PASTELS } from "@/ui/pastel";
import { formatEdited, formatLongDate } from "./dates";
import { MonthCalendar } from "./MonthCalendar";
import type { RecentPage, SubjectSummary } from "./queries";

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const subscribeDay = (cb: () => void) => {
  const id = setInterval(cb, 60_000);
  return () => clearInterval(id);
};
const noDay = () => null;

/** The user's local calendar day (null during server render, so no timezone mismatch). */
function useLocalToday(override?: Date): Date | null {
  const key = useSyncExternalStore(subscribeDay, localDay, noDay);
  if (override) return override;
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m, d, 12);
}

const count = (n: number, one: string, many: string) => (n === 1 ? t(one as "dashPageOne") : t(many as "dashPageMany").replace("{n}", String(n)));

function NewSubjectDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]") ?? []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
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
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-subject-h"
        className="flex w-full max-w-md flex-col gap-4 rounded-[28px] bg-card p-6 shadow-[0_8px_28px_rgba(27,26,31,0.12)]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="new-subject-h" className="text-xl font-medium">
            {t("newSubject")}
          </h2>
          <IconButton icon="plus" label={t("dashClose")} onClick={onClose} className="rotate-45 bg-panel" />
        </div>
        <SubjectForm bare />
      </div>
    </div>
  );
}

function RecentCard({ page, today }: { page: RecentPage; today: Date | null }) {
  const meta = [page.subjectName, page.notebookTitle].filter(Boolean).join(" · ");
  return (
    <Link href={`/app/p/${page.id}`} className="flex min-w-0 flex-col gap-3 rounded-3xl bg-card p-3.5 text-ink no-underline">
      <div className="relative h-[104px] overflow-hidden rounded-2xl" style={{ background: page.tint }}>
        <svg width="100%" height="104" viewBox="0 0 240 104" preserveAspectRatio="none" fill="none" stroke="#1B1A1F" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 30c14-8 22 6 34-2s18-6 30 0 20-4 32 2" />
          <path d="M18 52c20-6 30 4 46-1s24 3 40-2" />
          <path d="M18 74c10-5 18 3 28 0" />
          <circle cx="190" cy="56" r="22" strokeOpacity="0.35" />
        </svg>
      </div>
      <div className="flex min-w-0 flex-col gap-1 px-1 pb-1">
        <span className="truncate text-[17px] font-semibold">{page.title || t("untitledPage")}</span>
        <span className="truncate text-[13px] text-muted">{meta}</span>
        {today && <span className="truncate text-[13px] text-muted">{formatEdited(page.editedAt, today)}</span>}
      </div>
    </Link>
  );
}

function SubjectCard({ s }: { s: SubjectSummary }) {
  return (
    <Link
      href={`/app/s/${s.id}`}
      className="flex min-h-[168px] min-w-0 flex-col justify-between gap-5 rounded-[28px] p-5 text-ink no-underline"
      style={{ background: s.tint }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card">
          <Icon name="book" size={20} />
        </span>
        <span className="shrink-0 rounded-full bg-white/70 px-3 py-1.5 text-[13px] font-medium">{count(s.pages, "dashPageOne", "dashPageMany")}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate text-[26px] font-medium tracking-[-0.4px]">{s.name}</span>
        <span className="truncate text-[13px] text-[#3D3943]">{count(s.notebooks, "dashNotebookOne", "dashNotebookMany")}</span>
      </div>
    </Link>
  );
}

export function Dashboard({
  name,
  subjects,
  recent,
  today: todayOverride,
}: {
  name: string;
  subjects: SubjectSummary[];
  recent: RecentPage[];
  /** Test/fixture override; normally the user's local date, read on the client. */
  today?: Date;
}) {
  const today = useLocalToday(todayOverride);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null); // subject id
  const [creating, setCreating] = useState(false);

  const selectedName = subjects.find((s) => s.id === selected)?.name;
  const q = query.trim().toLowerCase();
  const shownSubjects = subjects.filter((s) => (!selected || s.id === selected) && s.name.toLowerCase().includes(q));
  const shownRecent = recent.filter(
    (p) =>
      (!selectedName || p.subjectName === selectedName) &&
      [p.title, p.subjectName, p.notebookTitle].some((v) => v.toLowerCase().includes(q)),
  );
  const empty = subjects.length === 0;
  const dotFor = (tint: string) => PASTELS.find((p) => p.hex === tint)?.dot ?? PASTELS[0].dot;

  return (
    <div className="flex flex-wrap items-start gap-5">
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-7 px-2 py-3">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-[40px] leading-[1.05] font-medium tracking-[-1.5px] break-words md:text-[56px]">
              {t("dashGreeting").replace("{name}", name)}
            </h1>
            <p className="text-[17px] text-muted">{t("dashSubtitle")}</p>
          </div>
          <label className="flex h-[52px] min-w-[260px] max-w-full items-center gap-2.5 rounded-full bg-card px-5 max-md:w-full">
            <Icon name="search" size={18} className="shrink-0 text-muted" />
            <span className="sr-only">{t("dashSearch")}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("dashSearch")}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none"
            />
          </label>
        </header>

        {!empty && (
          <div role="group" aria-label={t("dashFilterSubjects")} className="flex flex-wrap gap-2.5">
            <Chip dot="#1B1A1F" selected={selected === null} onClick={() => setSelected(null)}>
              {t("dashAllSubjects")}
            </Chip>
            {subjects.map((s) => (
              <Chip key={s.id} dot={dotFor(s.tint)} selected={selected === s.id} onClick={() => setSelected(selected === s.id ? null : s.id)}>
                {s.name}
              </Chip>
            ))}
          </div>
        )}

        {!empty && (
          <section aria-labelledby="continue-h" className="flex flex-col gap-3.5">
            <h2 id="continue-h" className="text-[15px] font-medium text-muted">
              {t("dashContinue")}
            </h2>
            {shownRecent.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
                {shownRecent.map((p) => (
                  <RecentCard key={p.id} page={p} today={today} />
                ))}
              </div>
            ) : (
              <p className="text-[15px] text-muted">{recent.length === 0 ? t("dashNoRecent") : t("dashNoMatches")}</p>
            )}
          </section>
        )}

        <section aria-labelledby="subjects-h" className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="subjects-h" className="text-[15px] font-medium text-muted">
              {t("dashYourSubjects")}
            </h2>
            {!empty && (
              <PillButton icon="plus" className="h-11" onClick={() => setCreating(true)}>
                {t("newSubject")}
              </PillButton>
            )}
          </div>
          {empty ? (
            <div className="flex flex-col items-start gap-4 rounded-[28px] bg-card p-6">
              <span className="flex size-11 items-center justify-center rounded-full bg-lavender">
                <Icon name="book" size={20} />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xl font-medium">{t("dashEmptyTitle")}</h3>
                <p className="text-[15px] text-muted">{t("dashEmptyBody")}</p>
              </div>
              <PillButton icon="plus" onClick={() => setCreating(true)}>
                {t("newSubject")}
              </PillButton>
            </div>
          ) : shownSubjects.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
              {shownSubjects.map((s) => (
                <SubjectCard key={s.id} s={s} />
              ))}
            </div>
          ) : (
            <p className="text-[15px] text-muted">{t("dashNoMatches")}</p>
          )}
        </section>
      </main>

      <aside aria-label={t("dashToday")} className="flex min-w-0 max-w-full flex-[1_1_300px] flex-col gap-4 rounded-[28px] bg-panel p-5 md:max-w-[360px]">
        <p className="min-h-6 text-center text-[15px] font-medium">{today ? formatLongDate(today) : ""}</p>
        {today && <MonthCalendar today={today} />}
        <section aria-labelledby="today-h" className="flex flex-col gap-2.5 rounded-3xl bg-card p-[18px]">
          <h2 id="today-h" className="text-base font-medium">
            {t("dashTodaysClasses")}
          </h2>
          <p className="text-sm leading-normal text-muted">{t("dashTodaysClassesBody")}</p>
          <span className="self-start rounded-full bg-peach px-3 py-1.5 text-xs font-medium">{t("dashComingSoon")}</span>
        </section>
        <section aria-labelledby="cards-h" className="flex flex-col gap-2.5 rounded-3xl bg-mint p-[18px]">
          <h2 id="cards-h" className="text-base font-medium">
            {t("dashFlashcardsDue")}
          </h2>
          <p className="text-sm leading-normal text-[#2F4A3D]">{t("dashFlashcardsDueBody")}</p>
          <span className="self-start rounded-full bg-card px-3 py-1.5 text-xs font-medium">{t("dashComingSoon")}</span>
        </section>
      </aside>

      {creating && <NewSubjectDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
