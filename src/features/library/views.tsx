import Link from "next/link";
import { t } from "@/i18n/en";
import { Icon } from "@/ui/icons";
import { toPastel } from "@/ui/pastel";
import { FolderActions } from "./FolderActions";
import { NewPageForm } from "./NewPageForm";
import { PageActionsMenu } from "./PageActionsMenu";
import { PagePreview } from "./PagePreview";

const count = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("{n}", String(n)));

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

/** A folder: every page in it (across its notebooks, newest first), New page, Rename and Delete. */
export function FolderView({
  folder,
  pages,
  audioPageIds,
  folders,
  previewUrls,
}: {
  folder: { id: string; name: string; color: string };
  pages: { id: string; title: string }[];
  audioPageIds: Set<string>;
  /** Every folder, for "Move to folder". */
  folders: { id: string; name: string }[];
  /** Signed preview URL by page id; a page without one shows the placeholder. */
  previewUrls?: Record<string, string>;
}) {
  const tint = toPastel(folder.color);
  return (
    <main className="flex min-w-0 flex-col gap-6 px-2 py-3">
      <BackPill href="/app">{t("backHome")}</BackPill>

      <section
        aria-labelledby="folder-h"
        className="relative flex flex-wrap items-end justify-between gap-6 overflow-hidden rounded-[32px] p-6 sm:p-8"
        style={{ background: tint }}
      >
        <svg width="260" height="260" viewBox="0 0 260 260" fill="none" stroke="#1B1A1F" strokeOpacity="0.12" strokeWidth="2" aria-hidden="true" className="absolute -top-[60px] -right-10">
          <circle cx="130" cy="130" r="120" />
          <circle cx="130" cy="130" r="80" />
          <circle cx="130" cy="130" r="40" />
        </svg>
        <div className="relative flex min-w-0 max-w-full flex-col gap-3.5">
          <span className="flex size-14 items-center justify-center rounded-full bg-card">
            <Icon name="folder" size={24} />
          </span>
          <h1 id="folder-h" className="truncate text-[40px] leading-[1.05] font-medium tracking-[-1.4px] md:text-[52px]">
            {folder.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/75 px-3.5 py-[7px] text-[13px] font-medium">
              {count(pages.length, t("dashPageOne"), t("dashPageMany"))}
            </span>
          </div>
          <FolderActions folder={folder} pageCount={pages.length} />
        </div>
        <div className="relative flex flex-wrap items-center gap-3">
          <NewPageForm variant="pill" folderId={folder.id} className="h-12 px-[22px] text-[15px]" />
        </div>
      </section>

      {pages.length === 0 ? (
        <p className="text-[15px] text-muted">{t("noPages")}</p>
      ) : (
        <section aria-label={t("pagesLabel")} className="grid grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-[18px]">
          {pages.map((p) => (
            <div key={p.id} className="relative flex min-w-0 flex-col">
            <Link href={`/app/p/${p.id}`} className="flex min-w-0 flex-col gap-2.5 text-ink no-underline">
              <div className="relative aspect-[3/4] overflow-hidden rounded-[22px] bg-card shadow-[0_1px_0_rgba(27,26,31,0.04),0_8px_24px_rgba(27,26,31,0.06)]">
                <PagePreview
                  src={previewUrls?.[p.id]}
                  fallback={null}
                />
                {audioPageIds.has(p.id) && (
                  <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-lavender px-2.5 py-[5px] text-xs font-medium">
                    <Icon name="mic" size={12} />
                    {t("recordingBadge")}
                  </span>
                )}
              </div>
              <span className="flex min-h-11 items-center px-1.5 pr-12"><span className="truncate text-base font-semibold">{p.title || t("untitledPage")}</span></span>
            </Link>
            <PageActionsMenu page={{ id: p.id, title: p.title, folderId: folder.id }} folders={folders} className="absolute right-0 bottom-0" direction="down" />
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
