"use client";

import { useState } from "react";
import { t } from "@/i18n/en";
import { PillButton } from "@/ui/Button";
import { Dialog } from "@/ui/Dialog";
import { DeleteFolderForm, RenameFolderForm } from "./forms";

/** Rename and Delete for the folder banner. Delete is only offered for an empty folder. */
export function FolderActions({ folder, pageCount }: { folder: { id: string; name: string }; pageCount: number }) {
  const [open, setOpen] = useState<"rename" | "delete" | null>(null);
  const close = () => setOpen(null);
  return (
    <>
      <div role="group" aria-label={t("folderActions")} className="flex flex-wrap gap-2">
        <PillButton variant="light" className="h-11" onClick={() => setOpen("rename")}>
          {t("renameFolder")}
        </PillButton>
        <PillButton variant="light" icon="trash" className="h-11" onClick={() => setOpen("delete")}>
          {t("deleteFolder")}
        </PillButton>
      </div>
      {open === "rename" && (
        <Dialog title={t("renameFolderTitle")} onClose={close}>
          <RenameFolderForm folderId={folder.id} name={folder.name} onDone={close} />
        </Dialog>
      )}
      {open === "delete" && (
        <Dialog title={t("deleteFolderTitle")} onClose={close}>
          {pageCount > 0 ? (
            <>
              <p className="text-[15px] text-ink">{t("folderNotEmpty")}</p>
              <PillButton variant="light" className="self-start bg-ground" onClick={close}>
                {t("cancel")}
              </PillButton>
            </>
          ) : (
            <>
              <p className="text-[15px] break-words text-ink">{t("deleteFolderConfirm", { name: folder.name })}</p>
              <DeleteFolderForm folderId={folder.id} onCancel={close} />
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
