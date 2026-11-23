"use client";

import { useState } from "react";
import { t } from "@/i18n/en";
import { PillButton } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { Icon } from "@/ui/icons";
import { NotebookForm } from "./forms";

/** "New notebook" trigger (banner pill or dashed tile) that opens the create dialog. */
export function NewNotebook({ subjectId, variant }: { subjectId: string; variant: "pill" | "tile" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "pill" ? (
        <PillButton icon="plus" className="relative px-[22px] text-[15px]" onClick={() => setOpen(true)}>
          {t("newNotebook")}
        </PillButton>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-[228px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-[28px] border-2 border-dashed border-[#CFC6BE] bg-transparent text-[15px] font-medium text-muted"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-card text-ink">
            <Icon name="plus" size={20} />
          </span>
          {t("newNotebook")}
        </button>
      )}
      {open && (
        <Dialog title={t("newNotebook")} onClose={() => setOpen(false)}>
          <NotebookForm subjectId={subjectId} bare />
        </Dialog>
      )}
    </>
  );
}
