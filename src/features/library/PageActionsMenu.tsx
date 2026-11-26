"use client";

import Link from "next/link";
import { useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "@/i18n/en";
import { IconButton, PillButton } from "@/ui/Button";
import { useSharePdf } from "@/features/share/useSharePdf";
import { Dialog } from "@/ui/Dialog";
import { deletePageAction, duplicatePageAction, movePageAction, renamePageAction } from "./actions";
import type { FormState } from "./form-error";

type PageRef = { id: string; title: string; folderId: string };
type FolderRef = { id: string; name: string };

const itemClass =
  "flex h-11 w-full shrink-0 cursor-pointer items-center rounded-2xl px-3.5 text-left text-[15px] font-medium text-ink no-underline hover:bg-panel focus-visible:bg-panel focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-50 aria-disabled:opacity-50";
const inputClass =
  "h-[52px] w-full rounded-2xl border-0 bg-ground px-[18px] text-[15px] text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-ink";

function ErrorText({ state }: { state: FormState }) {
  return state ? (
    <p role="alert" className="text-sm text-red-700">
      {state.error}
    </p>
  ) : null;
}

function RenamePageForm({ page, onDone }: { page: PageRef; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const result = await renamePageAction(page.id, prev, form);
    if (!result) onDone();
    return result;
  }, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("pageName")}</span>
        <input name="title" required defaultValue={page.title} className={inputClass} />
      </label>
      <ErrorText state={state} />
      <PillButton type="submit" disabled={pending} className="self-start">
        {t("saveName")}
      </PillButton>
    </form>
  );
}

function MovePageForm({ page, folders, onDone }: { page: PageRef; folders: FolderRef[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const result = await movePageAction(page.id, prev, form);
    if (!result) onDone();
    return result;
  }, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {folders.length === 0 ? <p className="text-[15px] text-muted">{t("pageMoveNoFolders")}</p> : null}
      <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
        {folders.map((f) => (
          <PillButton
            key={f.id}
            type="submit"
            name="folderId"
            value={f.id}
            variant="light"
            disabled={pending || f.id === page.folderId}
            className="h-11 justify-start bg-ground"
          >
            <span className="truncate">{f.id === page.folderId ? t("pageMoveCurrent", { name: f.name }) : f.name}</span>
          </PillButton>
        ))}
      </div>
      <ErrorText state={state} />
    </form>
  );
}

function DeletePageForm({ page, onDone, onCancel }: { page: PageRef; onDone: () => void; onCancel: () => void }) {
  const [state, action, pending] = useActionState(async () => {
    const result = await deletePageAction(page.id);
    if (!result) onDone();
    return result;
  }, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-[15px] break-words text-ink">{t("pageDeleteConfirm", { title: page.title || t("untitledPage") })}</p>
      <ErrorText state={state} />
      <div className="flex flex-wrap gap-3">
        <PillButton type="submit" disabled={pending}>
          {t("pageDeleteButton")}
        </PillButton>
        <PillButton variant="light" className="bg-ground" onClick={onCancel}>
          {t("cancel")}
        </PillButton>
      </div>
    </form>
  );
}

/**
 * The page's actions menu: a round button that opens a popover (Open, Duplicate, Rename, Move to folder, Share as PDF, Delete).
 * Escape or a press outside closes it and focus returns to the button; arrow keys move between items.
 */
export function PageActionsMenu({
  page,
  folders,
  className,
  direction = "up",
}: {
  page: PageRef;
  folders: FolderRef[];
  className?: string;
  /** Which side of the button the popover prefers; it flips to the other side when it would leave the viewport. */
  direction?: "up" | "down";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"rename" | "move" | "delete" | null>(null);
  const [error, setError] = useState<FormState>(null);
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const pdf = useSharePdf(page);
  const clearPdfError = pdf.clearError;
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);

  const closeMenu = (restoreFocus: boolean) => {
    setMenuOpen(false);
    setFlipped(false);
    setError(null);
    pdf.clearError();
    if (restoreFocus) triggerRef.current?.focus();
  };

  // Keep the popover inside the viewport: flip to the other side once, then nudge sideways.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!menuOpen || !el) return;
    el.style.transform = "";
    el.style.maxHeight = "";
    el.style.overflowY = "";
    const r = el.getBoundingClientRect();
    const margin = 8;
    const goesUp = direction === "up" !== flipped;
    const overflow = (rect: DOMRect) => (goesUp ? margin - rect.top : rect.bottom - (innerHeight - margin));
    if (!flipped && overflow(r) > 0) {
      // Flip when the other side has more room (the page can still scroll when it has room for the whole menu on
      // neither side, so the menu then keeps its own side and scrolls inside itself, below).
      const t = triggerRef.current!.getBoundingClientRect();
      const roomHere = goesUp ? t.top : innerHeight - t.bottom;
      const roomThere = goesUp ? innerHeight - t.bottom : t.top;
      if (roomThere >= r.height + 2 * margin || roomThere > roomHere) {
        setFlipped(true);
        return;
      }
    }
    // Still not inside the viewport on this side: cap the height and scroll the menu itself.
    const over = overflow(r);
    if (over > 0) {
      el.style.maxHeight = `${Math.max(132, r.height - over)}px`;
      el.style.overflowY = "auto";
    }
    const dx = r.left < margin ? margin - r.left : r.right > innerWidth - margin ? innerWidth - margin - r.right : 0;
    if (dx) el.style.transform = `translateX(${dx}px)`;
  }, [menuOpen, flipped, direction]);

  useEffect(() => {
    if (!menuOpen) return;
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setFlipped(false);
        setError(null);
        clearPdfError();
        triggerRef.current?.focus();
      }
    };
    const onPress = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setFlipped(false);
        setError(null);
        clearPdfError();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
    };
  }, [menuOpen, clearPdfError]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      list[(n + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Tab") closeMenu(false);
  };

  // Focus goes back to the button first, so the dialog's own focus return lands there once it closes.
  const openDialog = (d: "rename" | "move" | "delete") => {
    triggerRef.current?.focus();
    setMenuOpen(false);
    setFlipped(false);
    setDialog(d);
  };

  const duplicate = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await duplicatePageAction(page.id);
      if (result) setError(result);
      else closeMenu(true);
    } catch {
      setError({ error: t("genericError") });
    } finally {
      setBusy(false);
    }
  };

  // "PDF ready": the build outlived the tap (iOS), so this tap shares it; the call must stay synchronous.
  const sharePdf = () => {
    const run = pdf.ready ? pdf.shareReady() : pdf.share();
    void run.then((ok) => {
      if (ok) closeMenu(true);
    });
  };

  const closeDialog = () => setDialog(null);

  return (
    <div ref={root} className={className ?? "relative"}>
      <IconButton
        ref={triggerRef}
        icon="dots"
        label={t("pageActions", { title: page.title || t("untitledPage") })}
        tone="panel"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => (menuOpen ? closeMenu(true) : (setFlipped(false), setMenuOpen(true)))}
      />
      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("pageActionsMenu")}
          onKeyDown={onMenuKey}
          className={`absolute right-0 z-30 flex w-56 max-w-[calc(100vw-2rem)] flex-col gap-0.5 rounded-3xl bg-card p-2 shadow-[0_8px_28px_rgba(27,26,31,0.12)] ${direction === "up" !== flipped ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          <Link role="menuitem" href={`/app/p/${page.id}`} className={itemClass}>
            {t("pageOpen")}
          </Link>
          <button type="button" role="menuitem" aria-disabled={busy} onClick={duplicate} className={itemClass}>
            {t("pageDuplicate")}
          </button>
          <button type="button" role="menuitem" onClick={() => openDialog("rename")} className={itemClass}>
            {t("pageRename")}
          </button>
          <button type="button" role="menuitem" onClick={() => openDialog("move")} className={itemClass}>
            {t("pageMove")}
          </button>
          <button type="button" role="menuitem" aria-disabled={pdf.busy} onClick={sharePdf} className={itemClass}>
            {pdf.busy ? t("sharePdfBusy") : pdf.ready ? t("sharePdfReady") : t("pageShare")}
          </button>
          <button type="button" role="menuitem" onClick={() => openDialog("delete")} className={itemClass}>
            {t("pageDelete")}
          </button>
          <ErrorText state={error ?? (pdf.error ? { error: pdf.error } : null)} />
        </div>
      )}
      {dialog === "rename" && (
        <Dialog title={t("pageRenameTitle")} onClose={closeDialog}>
          <RenamePageForm page={page} onDone={closeDialog} />
        </Dialog>
      )}
      {dialog === "move" && (
        <Dialog title={t("pageMoveTitle")} onClose={closeDialog}>
          <MovePageForm page={page} folders={folders} onDone={closeDialog} />
        </Dialog>
      )}
      {dialog === "delete" && (
        <Dialog title={t("pageDeleteTitle")} onClose={closeDialog}>
          <DeletePageForm page={page} onDone={closeDialog} onCancel={closeDialog} />
        </Dialog>
      )}
    </div>
  );
}
