"use client";

import { useActionState } from "react";
import { createFolderAction, deleteFolderAction, renameFolderAction } from "./actions";
import { SUBJECT_COLORS } from "./colors";
import type { FormState } from "./form-error";
import { t } from "@/i18n/en";
import { PillButton } from "@/ui/Button";

const inputClass =
  "h-[52px] w-full rounded-2xl border-0 bg-ground px-[18px] text-[15px] text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-ink";

function ErrorText({ state }: { state: FormState }) {
  return state ? (
    <p role="alert" className="text-sm text-red-700">
      {state.error}
    </p>
  ) : null;
}

/** `bare` drops the heading, border and top margin so the form can sit inside a dialog that supplies its own title. */
export function FolderForm({ bare = false }: { bare?: boolean }) {
  const [state, action, pending] = useActionState(createFolderAction, null);
  return (
    <form action={action} className={bare ? "flex flex-col gap-4" : "mt-6 flex flex-col gap-4 rounded-lg border p-4"}>
      {!bare && <h2 className="font-medium">{t("newFolder")}</h2>}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("folderName")}</span>
        <input name="name" required className={inputClass} />
      </label>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 text-sm">{t("folderColor")}</legend>
        {SUBJECT_COLORS.map((c, i) => (
          <label key={c.hex} className="relative inline-flex size-11 cursor-pointer items-center justify-center">
            <input
              type="radio"
              name="color"
              value={c.hex}
              defaultChecked={i === 0}
              aria-label={t(c.label)}
              className="peer sr-only"
            />
            <span
              className="size-9 rounded-full border-2 border-transparent peer-checked:border-ink peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
              style={{ backgroundColor: c.hex }}
            />
          </label>
        ))}
      </fieldset>
      <ErrorText state={state} />
      <PillButton type="submit" disabled={pending} className="self-start">
        {t("createFolder")}
      </PillButton>
    </form>
  );
}

/** Rename form for a dialog; calls `onDone` after a successful save. */
export function RenameFolderForm({ folderId, name, onDone }: { folderId: string; name: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const result = await renameFolderAction(folderId, prev, form);
    if (!result) onDone();
    return result;
  }, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("folderName")}</span>
        <input name="name" required defaultValue={name} className={inputClass} />
      </label>
      <ErrorText state={state} />
      <PillButton type="submit" disabled={pending} className="self-start">
        {t("saveName")}
      </PillButton>
    </form>
  );
}

/** Confirm-delete form for a dialog. The server refuses (and this shows why) if the folder has pages. */
export function DeleteFolderForm({ folderId, onCancel }: { folderId: string; onCancel: () => void }) {
  const [state, action, pending] = useActionState(deleteFolderAction.bind(null, folderId), null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <ErrorText state={state} />
      <div className="flex flex-wrap gap-3">
        <PillButton type="submit" disabled={pending}>
          {t("deleteFolderButton")}
        </PillButton>
        <PillButton variant="light" className="bg-ground" onClick={onCancel}>
          {t("cancel")}
        </PillButton>
      </div>
    </form>
  );
}
