"use client";

import { useCallback, useRef, useState } from "react";
import { t } from "@/i18n/en";
import { createBrowserClient } from "@/lib/supabase/client";
import { loadPageTarget, PdfError, sharePagePdf } from "./page-pdf";

/** Share-as-PDF state for one page: `busy` while it is being made, `error` a friendly message. Never throws. */
export function useSharePdf(page: { id: string; title: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const share = useCallback(async (): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await sharePagePdf({ title: page.title || t("untitledPage"), target: () => loadPageTarget(createBrowserClient(), page.id) });
      return true;
    } catch (e) {
      setError(e instanceof PdfError && e.code === "empty" ? t("sharePdfEmpty") : t("sharePdfFailed"));
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [page.id, page.title]);

  const clearError = useCallback(() => setError(null), []);
  return { busy, error, share, clearError };
}
