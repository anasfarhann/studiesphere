import Link from "next/link";
import { Icon } from "@/ui/icons";
import { t } from "@/i18n/en";

export interface CanvasTitlePillProps {
  backHref: string;
  title: string;
  subject: string;
  notebook: string;
}

/** Left pill of the canvas top bar: back to the notebook, page title, and "Subject · Notebook". */
export function CanvasTitlePill({ backHref, title, subject, notebook }: CanvasTitlePillProps) {
  return (
    <div className="flex max-w-full min-w-0 items-center gap-2.5 rounded-full bg-card py-1 pr-5 pl-1 shadow-[0_8px_28px_rgba(27,26,31,0.08)] sm:max-w-sm">
      <Link
        href={backHref}
        aria-label={t("backToNotebook")}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ground text-ink"
      >
        <Icon name="chevronLeft" size={18} />
      </Link>
      <div className="flex min-w-0 flex-col">
        <h1 className="truncate text-[15px] leading-tight font-semibold text-ink">{title}</h1>
        <p className="truncate text-xs leading-tight text-muted">
          {subject} · {notebook}
        </p>
      </div>
    </div>
  );
}
