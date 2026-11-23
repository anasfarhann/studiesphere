"use client";

import { useActionState } from "react";
import { createNotebookAction, createPageAction, createSubjectAction } from "./actions";
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
export function SubjectForm({ bare = false }: { bare?: boolean }) {
  const [state, action, pending] = useActionState(createSubjectAction, null);
  return (
    <form action={action} className={bare ? "flex flex-col gap-4" : "mt-6 flex flex-col gap-4 rounded-lg border p-4"}>
      {!bare && <h2 className="font-medium">{t("newSubject")}</h2>}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("subjectName")}</span>
        <input name="name" required className={inputClass} />
      </label>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 text-sm">{t("subjectColor")}</legend>
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
        {t("createSubject")}
      </PillButton>
    </form>
  );
}

/** `bare` drops the border and top margin so the form can sit inside a dialog. */
export function NotebookForm({ subjectId, bare = false }: { subjectId: string; bare?: boolean }) {
  const [state, action, pending] = useActionState(createNotebookAction.bind(null, subjectId), null);
  return (
    <form action={action} className={bare ? "flex flex-col gap-4" : "mt-6 flex flex-col gap-3 rounded-lg border p-4"}>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("notebookTitle")}</span>
        <input name="title" required className={inputClass} />
      </label>
      <ErrorText state={state} />
      <PillButton type="submit" disabled={pending} className="self-start">
        {t("createNotebook")}
      </PillButton>
    </form>
  );
}

export function NewPageButton({ notebookId }: { notebookId: string }) {
  const [state, action, pending] = useActionState(createPageAction.bind(null, notebookId), null);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <ErrorText state={state} />
      <PillButton type="submit" icon="plus" disabled={pending} className="h-12 px-[22px] text-[15px]">
        {t("newPage")}
      </PillButton>
    </form>
  );
}
