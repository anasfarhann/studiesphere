"use client";

import { useEffect, useState } from "react";
import { t } from "@/i18n/en";
import { Icon } from "./icons";

/** One-off confirmation (e.g. after a password reset). Clears its `?notice=` query so a reload does not repeat it. */
export function FlashNotice({ message }: { message: string }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("notice")) return;
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);
  if (!open) return null;
  return (
    <div role="status" className="mb-4 flex items-center gap-3 rounded-3xl bg-mint py-1.5 pr-1.5 pl-5 text-sm font-medium">
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label={t("dismiss")}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-card focus-visible:outline-2 focus-visible:outline-ink"
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
