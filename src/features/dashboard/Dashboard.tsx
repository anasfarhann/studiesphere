"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { FolderForm } from "@/features/library/forms";
import { NewPageForm } from "@/features/library/NewPageForm";
import { PageActionsMenu } from "@/features/library/PageActionsMenu";
import { PagePreview } from "@/features/library/PagePreview";
import { t } from "@/i18n/en";
import { PillButton } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { Chip } from "@/ui/Chip";
import { Icon } from "@/ui/icons";
import { PASTELS } from "@/ui/pastel";
import { formatEdited, formatLongDate } from "./dates";
import { MonthCalendar } from "./MonthCalendar";
import type { FolderSummary, RecentPage } from "./queries";

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

function RecentCard({ page, today, folders }: { page: RecentPage; today: Date | null; folders: FolderSummary[] }) {
  return (
    <div className="relative flex min-w-0 flex-col rounded-3xl bg-card p-3.5 text-ink">
      <Link href={`/app/p/${page.id}`} className="flex min-w-0 flex-col gap-3 text-ink no-underline">
        <div className="relative h-[104px] overflow-hidden rounded-2xl" style={{ background: page.tint }}>
          <PagePreview
            src={page.previewUrl}
            fallback={null}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1 px-1 pr-12 pb-1">
          <span className="truncate text-[17px] font-semibold">{page.title || t("untitledPage")}</span>
          <span className="truncate text-[13px] text-muted">{page.folderName}</span>
          {today && <span className="truncate text-[13px] text-muted">{formatEdited(page.editedAt, today)}</span>}
        </div>
      </Link>
      <PageActionsMenu
        page={{ id: page.id, title: page.title, folderId: page.folderId }}
        folders={folders.map((f) => ({ id: f.id, name: f.name }))}
        className="absolute right-3.5 bottom-3.5"
      />
    </div>
  );
}

function FolderCard({ s }: { s: FolderSummary }) {
  return (
    <Link
      href={`/app/s/${s.id}`}
      className="flex min-h-[168px] min-w-0 flex-col justify-between gap-5 rounded-[28px] p-5 text-ink no-underline"
      style={{ background: s.tint }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card">
          <Icon name="folder" size={20} />
        </span>
        <span className="shrink-0 rounded-full bg-white/70 px-3 py-1.5 text-[13px] font-medium">{count(s.pages, "dashPageOne", "dashPageMany")}</span>
      </div>
      <span className="truncate text-[26px] font-medium tracking-[-0.4px]">{s.name}</span>
    </Link>
  );
}

export function Dashboard({
  name,
  folders,
  recent,
  today: todayOverride,
}: {
  name: string;
  folders: FolderSummary[];
  recent: RecentPage[];
  /** Test/fixture override; normally the user's local date, read on the client. */
  today?: Date;
}) {
  const today = useLocalToday(todayOverride);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null); // folder id
  const [creating, setCreating] = useState(false);

  const q = query.trim().toLowerCase();
  const shownFolders = folders.filter((s) => (!selected || s.id === selected) && s.name.toLowerCase().includes(q));
  const shownRecent = recent.filter(
    (p) =>
      (!selected || p.folderId === selected) &&
      [p.title, p.folderName].some((v) => v.toLowerCase().includes(q)),
  );
  const empty = folders.length === 0;
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
          <div className="flex flex-wrap items-center gap-3 max-md:w-full">
            <label className="flex h-[52px] min-w-[260px] max-w-full items-center gap-2.5 rounded-full bg-card px-5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink max-md:min-w-0 max-md:flex-1">
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
          </div>
        </header>

        {!empty && (
          <div role="group" aria-label={t("dashFilterFolders")} className="flex flex-wrap gap-2.5">
            <Chip dot="#1B1A1F" selected={selected === null} onClick={() => setSelected(null)}>
              {t("dashAllFolders")}
            </Chip>
            {folders.map((s) => (
              <Chip key={s.id} dot={dotFor(s.tint)} selected={selected === s.id} onClick={() => setSelected(selected === s.id ? null : s.id)}>
                {s.name}
              </Chip>
            ))}
          </div>
        )}

        <section aria-labelledby="continue-h" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="continue-h" className="text-[15px] font-medium text-muted">
              {t("dashContinue")}
            </h2>
            <NewPageForm variant="pill" className="h-11" />
          </div>
          {!empty &&
            (shownRecent.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
                {shownRecent.map((p) => (
                  <RecentCard key={p.id} page={p} today={today} folders={folders} />
                ))}
              </div>
            ) : (
              <p className="text-[15px] text-muted">{recent.length === 0 || (q === "" && selected) ? t("dashNoRecent") : t("dashNoMatches")}</p>
            ))}
        </section>

        <section aria-labelledby="folders-h" className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="folders-h" className="text-[15px] font-medium text-muted">
              {t("dashYourFolders")}
            </h2>
            {!empty && (
              <PillButton icon="plus" className="h-11" onClick={() => setCreating(true)}>
                {t("newFolder")}
              </PillButton>
            )}
          </div>
          {empty ? (
            <div className="flex flex-col items-start gap-4 rounded-[28px] bg-card p-6">
              <span className="flex size-11 items-center justify-center rounded-full bg-lavender">
                <Icon name="folder" size={20} />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xl font-medium">{t("dashEmptyTitle")}</h3>
                <p className="text-[15px] text-muted">{t("dashEmptyBody")}</p>
              </div>
              <PillButton icon="plus" onClick={() => setCreating(true)}>
                {t("newFolder")}
              </PillButton>
            </div>
          ) : shownFolders.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
              {shownFolders.map((s) => (
                <FolderCard key={s.id} s={s} />
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

      {creating && (
        <Dialog title={t("newFolder")} onClose={() => setCreating(false)}>
          <FolderForm bare />
        </Dialog>
      )}
    </div>
  );
}
