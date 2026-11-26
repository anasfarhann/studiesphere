"use client";

import { useCallback, useRef, useState } from "react";
import { t } from "@/i18n/en";
import { createBrowserClient } from "@/lib/supabase/client";
import { deliverPdf, loadPageTarget, PdfError, sharePagePdf, type PdfTarget } from "./page-pdf";

/**
 * Share-as-PDF state for one page: `busy` while it is being made, `error` a friendly message, and `ready` when the
 * PDF is built but the browser wants a fresh tap for the share sheet (iOS loses the gesture during the build):
 * show a Share button that calls `shareReady()`. Never throws.
 *
 * `liveTarget`: the canvas page's live editor scene (never destroyed here); without it the page is loaded from
 * Supabase through the browser client (dashboard and folder menus).
 */
export function useSharePdf(page: { id: string; title: string }, liveTarget?: PdfTarget | null) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const running = useRef(false);
  const built = useRef<{ blob: Blob; title: string } | null>(null);
  const title = page.title || t("untitledPage");

  const share = useCallback(async (): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError(null);
    setReady(false);
    built.current = null;
    try {
      const { result, blob } = await sharePagePdf({
        title,
        target: async () => {
          if (liveTarget) return liveTarget;
          return loadPageTarget(createBrowserClient(), page.id);
        },
      });
      if (result === "needs-tap") {
        built.current = { blob, title };
        setReady(true);
        return false;
      }
      return true;
    } catch (e) {
      setError(e instanceof PdfError && e.code === "empty" ? t("sharePdfEmpty") : t("sharePdfFailed"));
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [page.id, title, liveTarget]);

  /** From a tap on the Share button: navigator.share is reached synchronously, so the gesture counts. */
  const shareReady = useCallback((): Promise<boolean> => {
    const b = built.current;
    if (!b) return Promise.resolve(false);
    return deliverPdf(b.blob, b.title, { fromTap: true }).then(
      () => {
        built.current = null;
        setReady(false);
        return true;
      },
      () => {
        setError(t("sharePdfFailed"));
        return false;
      },
    );
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { busy, error, ready, share, shareReady, clearError };
}
