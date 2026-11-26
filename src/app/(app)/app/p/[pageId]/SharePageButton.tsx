"use client";

import { t } from "@/i18n/en";
import { useLivePageTarget } from "@/canvas/react/live-page-target";
import { useSharePdf } from "@/features/share/useSharePdf";
import { IconButton, PillButton } from "@/ui/Button";

/**
 * Share the page as a PDF from the canvas header: a round 44 px button. It exports the live editor scene (what is on
 * screen, including edits not saved yet); before the editor exists it falls back to the saved page. The error, or the
 * "PDF ready" Share button (iOS wants a fresh tap for the share sheet), shows under the title pill, which is the
 * positioned ancestor, so the popover stays inside the viewport whatever the pill's width.
 */
export function SharePageButton({ pageId, title }: { pageId: string; title: string }) {
  const live = useLivePageTarget();
  const { busy, error, ready, share, shareReady } = useSharePdf({ id: pageId, title }, live);
  return (
    <>
      <IconButton
        icon="share"
        label={busy ? t("sharePdfBusy") : t("sharePdfPage")}
        aria-busy={busy}
        disabled={busy}
        onClick={() => void share()}
        className={busy ? "animate-pulse" : undefined}
      />
      {error ? (
        <p role="alert" className="absolute top-full left-0 z-30 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-card p-3 text-sm text-red-700 shadow-[0_8px_28px_rgba(27,26,31,0.12)]">
          {error}
        </p>
      ) : null}
      {ready && !error ? (
        <div className="absolute top-full left-0 z-30 mt-2 max-w-[calc(100vw-1.5rem)] rounded-3xl bg-card p-2 shadow-[0_8px_28px_rgba(27,26,31,0.12)]">
          <PillButton icon="share" onClick={() => void shareReady()}>
            {t("sharePdfReady")}
          </PillButton>
        </div>
      ) : null}
    </>
  );
}
