import { t } from "@/i18n/en";
import { Icon, type IconName } from "./icons";
import { Wordmark } from "./Logo";

const cardHead = "flex items-center gap-2.5 p-1";
const bubble = "flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-ink";
const cardTitle = "text-[17px] leading-tight font-semibold";

function Bubble({ icon }: { icon: IconName }) {
  return (
    <span className={bubble}>
      <Icon name={icon} size={16} />
    </span>
  );
}

function NotesPreview() {
  return (
    <div className="col-span-2 flex gap-3.5 overflow-hidden rounded-3xl bg-pink p-3.5">
      <div className="flex w-[38%] max-w-[150px] shrink-0 flex-col justify-between gap-3 p-1">
        <Bubble icon="pen" />
        <span className="flex flex-col gap-0.5">
          <span className={cardTitle}>{t("featureNotes")}</span>
          <span className="text-[12.5px] leading-snug text-ink-soft">{t("featureNotesBody")}</span>
        </span>
      </div>
      <div
        className="relative flex min-w-0 flex-1 flex-col gap-1 overflow-hidden rounded-2xl bg-paper px-4 py-3 font-hand text-[21px] leading-[1.12]"
        style={{ backgroundImage: "radial-gradient(var(--color-dot) 1.1px, transparent 1.1px)", backgroundSize: "18px 18px" }}
      >
        <span className="text-[25px] font-bold">{t("previewNoteTitle")}</span>
        <span className="self-start rounded px-[5px]" style={{ background: "rgb(244 211 94 / 0.65)" }}>
          {t("previewNoteHighlight")}
        </span>
        <span className="text-pen-blue">{t("previewNoteLine")}</span>
        <svg width="150" height="44" viewBox="0 0 150 44" fill="none" strokeLinecap="round" className="shrink-0">
          <ellipse cx="62" cy="22" rx="56" ry="17" stroke="var(--color-ink)" strokeWidth="1.8" />
          <path d="M24 22c9-8 18 8 27 0s18 8 27 0 18 8 22 0" stroke="var(--color-now)" strokeWidth="1.8" />
        </svg>
        {/* Pinned photo: bottom-right above the Lecture chip, clear of the handwriting. */}
        <span className="absolute right-3 bottom-12 h-8 w-11 lg:right-5 lg:h-[40px] lg:w-[54px] rotate-[5deg] rounded-[9px] border-[3px] border-card bg-sky shadow-[0_4px_12px_rgb(27_26_31/0.12)]" />
        <span className="absolute right-[18px] bottom-3 flex items-center gap-1.5 rounded-full bg-card py-1 pr-2.5 pl-1.5 font-sans text-[11px] font-medium shadow-[0_2px_8px_rgb(27_26_31/0.08)]">
          <span className="flex size-[18px] items-center justify-center rounded-full bg-lavender">
            <Icon name="mic" size={10} />
          </span>
          {t("previewLecture")}
        </span>
      </div>
    </div>
  );
}

const CLASSES = [
  { time: "8:00", name: "previewMaths", bg: "bg-lavender", done: true },
  { time: "10:00", name: "previewBiology", bg: "bg-mint", now: true },
  { time: "13:00", name: "previewHistory", bg: "bg-sky" },
  { time: "15:00", name: "previewEnglish", bg: "bg-butter" },
] as const;

function TimetablePreview() {
  return (
    <div className="row-span-2 flex flex-col gap-3 overflow-hidden rounded-3xl bg-peach p-3.5">
      <div className={cardHead}>
        <Bubble icon="calendar" />
        <span className={cardTitle}>{t("featureTimetable")}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 rounded-2xl bg-paper p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold">{t("previewToday")}</span>
          <span className="text-xs text-muted">{t("previewDate")}</span>
        </div>
        {CLASSES.map((c) => (
          <div key={c.time} className="contents">
            <div className="flex items-stretch gap-2.5">
              <span className="w-[38px] shrink-0 pt-2 text-[11px] text-muted">{c.time}</span>
              <span
                className={`min-w-0 flex-1 rounded-xl px-2.5 py-2 text-[13px] font-medium ${c.bg} ${
                  "done" in c ? "text-muted line-through" : ""
                } ${"now" in c ? "shadow-[inset_0_0_0_2px_var(--color-ink)]" : ""}`}
              >
                {t(c.name)}
                {"now" in c && <span className="block text-[11px] font-normal text-ink-soft">{t("previewNow")}</span>}
              </span>
            </div>
            {"now" in c && (
              <div className="-my-0.5 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-now" />
                <span className="h-0.5 flex-1 rounded-sm bg-now" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlashcardsPreview() {
  return (
    <div className="flex flex-col gap-2.5 overflow-hidden rounded-3xl bg-lavender p-3.5">
      <div className={cardHead}>
        <Bubble icon="cards" />
        <span className={cardTitle}>{t("featureFlashcards")}</span>
        <span className="ml-auto text-xs font-medium whitespace-nowrap text-ink-soft lg:max-xl:hidden">{t("previewDue")}</span>
      </div>
      <div className="relative min-h-[88px] flex-1">
        <div className="absolute top-0.5 right-1.5 bottom-1.5 left-[18px] rotate-[4deg] rounded-2xl bg-paper opacity-60" />
        <div className="absolute top-1.5 right-3.5 bottom-0.5 left-1.5 flex flex-col justify-between gap-2 rounded-2xl bg-card px-3.5 py-3 shadow-[0_8px_20px_rgb(27_26_31/0.08)]">
          <span className="text-[15px] leading-snug font-medium lg:max-xl:text-[13px]">{t("previewCardQuestion")}</span>
          <span className="flex gap-1.5">
            <span className="rounded-full bg-pink px-2.5 py-1 text-[11px] font-medium whitespace-nowrap">{t("previewAgain")}</span>
            <span className="rounded-full bg-mint px-2.5 py-1 text-[11px] font-medium whitespace-nowrap">{t("previewGotIt")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

const ANSWERS = [
  { key: "previewNucleus", cls: "bg-sky" },
  { key: "previewMitochondria", cls: "bg-ink text-white" },
  { key: "previewRibosome", cls: "bg-peach" },
  { key: "previewGolgi", cls: "bg-pink" },
] as const;

function QuizPreview() {
  return (
    <div className="flex flex-col gap-2.5 overflow-hidden rounded-3xl bg-mint p-3.5">
      <div className={cardHead}>
        <Bubble icon="trophy" />
        <span className={cardTitle}>{t("featureQuiz")}</span>
        <span className="ml-auto flex items-center gap-[5px] text-xs font-medium text-ink-soft lg:max-xl:hidden">
          <span className="size-[7px] rounded-full bg-saved" />
          {t("previewLive")}
        </span>
      </div>
      <div className="grid flex-1 grid-cols-[auto_minmax(0,1fr)] content-center gap-1.5 rounded-2xl bg-paper p-2.5 text-[11px] font-medium">
        {ANSWERS.map((a) => (
          <span key={a.key} className={`truncate rounded-[10px] px-1.5 py-2 ${a.cls}`}>
            {t(a.key)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Beige panel beside the sign-in form (A+ design): brand row, headline and static feature previews. */
export function BrandPanel({ className = "" }: { className?: string }) {
  return (
    <section
      aria-label={t("brandPanelLabel")}
      className={`min-w-0 flex-col gap-[22px] overflow-hidden rounded-[32px] bg-panel px-9 py-8 lg:max-xl:px-7 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Wordmark size={34} />
        <span className="ml-auto flex items-center gap-2 rounded-full bg-card py-[7px] pr-3.5 pl-2.5 text-[13px] font-medium">
          <Icon name="pen" size={16} />
          {t("madeForIpad")}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[38px] leading-[1.06] font-semibold tracking-[-0.025em]">{t("brandHeadline")}</h2>
        <p className="m-0 text-[15px] text-muted">{t("brandSubhead")}</p>
      </div>

      <div
        aria-hidden="true"
        className="grid h-[360px] grid-cols-3 grid-rows-2 gap-3 lg:h-auto lg:min-h-[360px] lg:flex-1"
      >
        <NotesPreview />
        <TimetablePreview />
        <FlashcardsPreview />
        <QuizPreview />
      </div>
    </section>
  );
}

const TILES: { icon: IconName; label: "tileNotes" | "tileTimetable" | "tileFlashcards" | "tileQuizzes"; bg: string }[] = [
  { icon: "pen", label: "tileNotes", bg: "bg-pink" },
  { icon: "calendar", label: "tileTimetable", bg: "bg-peach" },
  { icon: "cards", label: "tileFlashcards", bg: "bg-lavender" },
  { icon: "trophy", label: "tileQuizzes", bg: "bg-mint" },
];

/** Compact brand header for phones (APlusPhone): wordmark and four pastel feature tiles. */
export function PhoneBrand({ className = "" }: { className?: string }) {
  return (
    <section aria-label={t("brandPanelLabel")} className={`flex-col gap-3.5 ${className}`}>
      <div className="px-1.5 pt-2">
        <Wordmark size={30} />
      </div>
      <div aria-hidden="true" className="grid grid-cols-4 gap-2">
        {TILES.map((tile) => (
          <span
            key={tile.label}
            className={`flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-[18px] text-[11px] font-medium ${tile.bg}`}
          >
            <Icon name={tile.icon} size={16} />
            <span className="max-w-full truncate px-1">{t(tile.label)}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
