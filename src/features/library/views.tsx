import Link from "next/link";
import { t } from "@/i18n/en";
import { Icon } from "@/ui/icons";
import { PASTELS, toPastel } from "@/ui/pastel";
import { NewNotebook } from "./NewNotebook";
import { NewPageButton } from "./forms";

const count = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("{n}", String(n)));
const dotFor = (tint: string) => PASTELS.find((p) => p.hex === tint)?.dot ?? PASTELS[0].dot;

function BackPill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex h-11 max-w-full items-center gap-2 self-start rounded-full bg-card pr-[18px] pl-3 text-sm font-medium text-ink no-underline"
    >
      <Icon name="chevronLeft" size={18} className="shrink-0" />
      <span className="truncate">{children}</span>
    </Link>
  );
}

export function SubjectView({
  subject,
  notebooks,
}: {
  subject: { id: string; name: string; color: string };
  notebooks: { id: string; title: string; pages: number }[];
}) {
  const tint = toPastel(subject.color);
  const totalPages = notebooks.reduce((n, nb) => n + nb.pages, 0);
  return (
    <main className="flex min-w-0 flex-col gap-6 px-2 py-3">
      <BackPill href="/app">{t("backHome")}</BackPill>

      <section
        aria-labelledby="subject-h"
        className="relative flex flex-wrap items-end justify-between gap-6 overflow-hidden rounded-[32px] p-8"
        style={{ background: tint }}
      >
        <svg width="260" height="260" viewBox="0 0 260 260" fill="none" stroke="#1B1A1F" strokeOpacity="0.12" strokeWidth="2" aria-hidden="true" className="absolute -top-[60px] -right-10">
          <circle cx="130" cy="130" r="120" />
          <circle cx="130" cy="130" r="80" />
          <circle cx="130" cy="130" r="40" />
        </svg>
        <div className="relative flex min-w-0 flex-col gap-3.5">
          <span className="flex size-14 items-center justify-center rounded-full bg-card">
            <Icon name="book" size={24} />
          </span>
          <h1 id="subject-h" className="truncate text-[40px] leading-[1.05] font-medium tracking-[-1.4px] md:text-[52px]">
            {subject.name}
          </h1>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white/75 px-3.5 py-[7px] text-[13px] font-medium">
              {count(notebooks.length, t("dashNotebookOne"), t("dashNotebookMany"))}
            </span>
            <span className="rounded-full bg-white/75 px-3.5 py-[7px] text-[13px] font-medium">
              {count(totalPages, t("dashPageOne"), t("dashPageMany"))}
            </span>
          </div>
        </div>
        <NewNotebook subjectId={subject.id} variant="pill" />
      </section>

      <section aria-labelledby="nb-h" className="flex flex-col gap-3.5">
        <h2 id="nb-h" className="text-[15px] font-medium text-muted">
          {t("subjectNotebooks")}
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
          {notebooks.map((nb) => (
            <Link key={nb.id} href={`/app/n/${nb.id}`} className="flex min-w-0 flex-col gap-4 rounded-[28px] bg-card p-4 text-ink no-underline">
              <div className="flex h-[132px] items-end justify-center rounded-[20px] pb-3.5" style={{ background: tint }} aria-hidden="true">
                <span className="h-24 w-[78px] translate-x-3.5 -rotate-[8deg] rounded-xl bg-white/55" />
                <span className="h-[100px] w-[78px] rounded-xl bg-white/80" />
                <span className="h-24 w-[78px] -translate-x-3.5 rotate-[8deg] rounded-xl bg-white" />
              </div>
              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-[19px] font-semibold">{nb.title}</span>
                  <span className="truncate text-[13px] text-muted">{count(nb.pages, t("dashPageOne"), t("dashPageMany"))}</span>
                </div>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ground">
                  <Icon name="chevronRight" size={18} />
                </span>
              </div>
            </Link>
          ))}
          <NewNotebook subjectId={subject.id} variant="tile" />
        </div>
      </section>
    </main>
  );
}

export function NotebookView({
  subject,
  notebook,
  pages,
  audioPageIds,
}: {
  subject: { id: string; name: string; color: string };
  notebook: { id: string; title: string };
  pages: { id: string; title: string }[];
  audioPageIds: Set<string>;
}) {
  const tint = toPastel(subject.color);
  return (
    <main className="flex min-w-0 flex-col gap-6 px-2 py-3">
      <BackPill href={`/app/s/${subject.id}`}>{t("backTo", { name: subject.name })}</BackPill>

      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-muted">
            <span className="size-3 shrink-0 rounded-full" style={{ background: dotFor(tint) }} aria-hidden="true" />
            <span className="truncate">{t("notebookOf", { name: subject.name })}</span>
          </span>
          <h1 className="truncate text-[40px] leading-[1.05] font-medium tracking-[-1.4px] md:text-[52px]">{notebook.title}</h1>
        </div>
        <NewPageButton notebookId={notebook.id} />
      </header>

      {pages.length === 0 ? (
        <p className="text-[15px] text-muted">{t("noPages")}</p>
      ) : (
        <section aria-label={t("pagesLabel")} className="grid grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-[18px]">
          {pages.map((p, i) => (
            <Link key={p.id} href={`/app/p/${p.id}`} className="flex min-w-0 flex-col gap-2.5 text-ink no-underline">
              <div className="relative aspect-[3/4] overflow-hidden rounded-[22px] bg-card shadow-[0_1px_0_rgba(27,26,31,0.04),0_8px_24px_rgba(27,26,31,0.06)]">
                <svg width="100%" height="100%" viewBox="0 0 150 200" fill="none" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 30c10-6 18 4 28-1s14-3 24 1" stroke="#1B1A1F" strokeOpacity="0.6" strokeWidth="2" />
                  <path d="M18 54c16-5 24 3 38-1s20 2 34-1" stroke="#1B1A1F" strokeOpacity="0.45" strokeWidth="1.6" />
                  <path d="M18 72c12-4 20 2 30 0" stroke="#1B1A1F" strokeOpacity="0.45" strokeWidth="1.6" />
                  <rect x="16" y="92" width="118" height="10" rx="5" fill={PASTELS[i % PASTELS.length].dot} fillOpacity="0.7" stroke="none" />
                  <circle cx="104" cy="148" r="26" stroke="#1B1A1F" strokeOpacity="0.35" strokeWidth="1.6" />
                  <circle cx="104" cy="148" r="9" stroke="#1B1A1F" strokeOpacity="0.35" strokeWidth="1.6" />
                </svg>
                {audioPageIds.has(p.id) && (
                  <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-lavender px-2.5 py-[5px] text-xs font-medium">
                    <Icon name="mic" size={12} />
                    {t("recordingBadge")}
                  </span>
                )}
              </div>
              <span className="truncate px-1.5 text-base font-semibold">{p.title || t("untitledPage")}</span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
