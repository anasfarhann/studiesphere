"use client";

import { t } from "@/i18n/en";
import { useSharePdf } from "@/features/share/useSharePdf";
import { IconButton } from "@/ui/Button";

/** Share the page as a PDF from the canvas header; a round 44 px button, with the error shown right under it. */
export function SharePageButton({ pageId, title }: { pageId: string; title: string }) {
  const { busy, error, share } = useSharePdf({ id: pageId, title });
  return (
    <div className="relative shrink-0">
      <IconButton
        icon="share"
        label={busy ? t("sharePdfBusy") : t("sharePdfPage")}
        aria-busy={busy}
        disabled={busy}
        onClick={() => void share()}
        className={busy ? "animate-pulse" : undefined}
      />
      {error ? (
        <p role="alert" className="absolute top-full right-0 z-30 mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-2xl bg-card p-3 text-sm text-red-700 shadow-[0_8px_28px_rgba(27,26,31,0.12)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
