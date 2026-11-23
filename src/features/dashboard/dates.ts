import { t } from "@/i18n/en";

const MS_DAY = 86_400_000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", opts);

/** "edited today" / "edited yesterday" / "edited Friday" / "edited 3 Nov" (year added when it differs). Uses the local calendar day of `today`. */
export function formatEdited(iso: string, today: Date): string {
  const edited = new Date(iso);
  const days = Math.round((dayStart(today).getTime() - dayStart(edited).getTime()) / MS_DAY);
  if (days <= 0) return t("dashEditedToday");
  if (days === 1) return t("dashEditedYesterday");
  if (days < 7) return t("dashEditedOn").replace("{when}", fmt({ weekday: "long" }).format(edited));
  const when = fmt(
    edited.getFullYear() === today.getFullYear()
      ? { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" },
  ).format(edited);
  return t("dashEditedOn").replace("{when}", when);
}

/** "Monday, 23 November" */
export function formatLongDate(d: Date): string {
  return `${fmt({ weekday: "long" }).format(d)}, ${fmt({ day: "numeric", month: "long" }).format(d)}`;
}

/** "November 2026" */
export function formatMonthYear(d: Date): string {
  return fmt({ month: "long", year: "numeric" }).format(d);
}
