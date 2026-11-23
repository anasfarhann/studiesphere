import { t } from "@/i18n/en";
import { formatMonthYear } from "./dates";

/** Monday-first month grid on a dark card; `today` (the user's local date) is highlighted. */
export function MonthCalendar({ today }: { today: Date }) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const blanks = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  return (
    <section aria-labelledby="cal-h" className="flex flex-col gap-3 rounded-3xl bg-ink p-[18px] text-white">
      <div className="flex items-center justify-between gap-2">
        <h2 id="cal-h" className="truncate text-base font-medium">
          {formatMonthYear(today)}
        </h2>
        <span className="shrink-0 rounded-full bg-[#3A3740] px-2.5 py-[5px] text-xs">{t("dashTimetableSoon")}</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {t("dashWeekdays").split(",").map((w) => (
          <span key={w} className="text-[11px] text-[#B8B3BE]">
            {w}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`b${i}`} data-blank aria-hidden="true" />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const day = i + 1;
          const isToday = day === today.getDate();
          return (
            <span
              key={day}
              data-day
              aria-current={isToday ? "date" : undefined}
              className={`flex aspect-square items-center justify-center rounded-full text-[13px] ${
                isToday ? "bg-today font-semibold text-ink" : ""
              }`}
            >
              {day}
            </span>
          );
        })}
      </div>
    </section>
  );
}
