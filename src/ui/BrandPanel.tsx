import type { ReactNode } from "react";
import { t } from "@/i18n/en";
import { Icon, type IconName } from "./icons";

const FEATURES: { icon: IconName; label: "featureNotes" | "featureTimetable" | "featureFlashcards" | "featureQuiz"; bg: string; drop: boolean }[] = [
  { icon: "pen", label: "featureNotes", bg: "bg-pink", drop: false },
  { icon: "calendar", label: "featureTimetable", bg: "bg-peach", drop: true },
  { icon: "cards", label: "featureFlashcards", bg: "bg-lavender", drop: false },
  { icon: "trophy", label: "featureQuiz", bg: "bg-mint", drop: true },
];

/** Beige left panel shared by sign-in, sign-up and the landing page. */
export function BrandPanel({
  children,
  brandAsHeading = false,
  className = "",
}: {
  children?: ReactNode;
  /** Render the wordmark as the page's h1 (landing page). */
  brandAsHeading?: boolean;
  className?: string;
}) {
  const Wordmark = brandAsHeading ? "h1" : "span";
  return (
    <section
      aria-label={t("brandPanelLabel")}
      className={`relative flex min-w-0 flex-col justify-between gap-8 overflow-hidden rounded-[32px] bg-panel p-6 sm:p-10 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-ink text-white">
          <Icon name="logo" size={24} />
        </span>
        <Wordmark className="m-0 text-xl font-semibold">{t("appName")}</Wordmark>
      </div>

      <div aria-hidden="true" className="hidden max-w-[440px] grid-cols-2 gap-3.5 pb-7 sm:grid">
        {FEATURES.map((f) => (
          <div key={f.label} className={`flex flex-col gap-7 rounded-3xl p-[18px] ${f.bg} ${f.drop ? "translate-y-7" : ""}`}>
            <span className="flex size-10 items-center justify-center rounded-full bg-card text-ink">
              <Icon name={f.icon} size={18} />
            </span>
            <span className="text-lg font-medium">{t(f.label)}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        <h2 className="m-0 text-[32px] leading-[1.1] font-medium tracking-tight text-ink sm:text-[40px]">{t("brandHeadline")}</h2>
        <p className="m-0 text-base text-muted">{t("brandSubhead")}</p>
        {children}
      </div>
    </section>
  );
}
