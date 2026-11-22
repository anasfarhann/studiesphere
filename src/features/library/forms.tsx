"use client";

import { useActionState } from "react";
import { createNotebookAction, createPageAction, createSubjectAction } from "./actions";
import { SUBJECT_COLORS } from "./colors";
import type { FormState } from "./form-error";
import { t } from "@/i18n/en";

function ErrorText({ state }: { state: FormState }) {
  return state ? (
    <p role="alert" className="text-sm text-red-700">
      {state.error}
    </p>
  ) : null;
}

export function SubjectForm() {
  const [state, action, pending] = useActionState(createSubjectAction, null);
  return (
    <form action={action} className="mt-6 flex flex-col gap-4 rounded-lg border p-4">
      <h2 className="font-medium">{t("newSubject")}</h2>
      <label className="flex flex-col gap-1">
        <span className="text-sm">{t("subjectName")}</span>
        <input name="name" required className="min-h-11 rounded-md border px-3" />
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
              className="size-9 rounded-full border-2 border-transparent peer-checked:border-black peer-checked:ring-2 peer-checked:ring-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
              style={{ backgroundColor: c.hex }}
            />
          </label>
        ))}
      </fieldset>
      <ErrorText state={state} />
      <button type="submit" disabled={pending} className="min-h-11 self-start rounded-md bg-black px-4 text-white">
        {t("createSubject")}
      </button>
    </form>
  );
}

export function NotebookForm({ subjectId }: { subjectId: string }) {
  const [state, action, pending] = useActionState(createNotebookAction.bind(null, subjectId), null);
  return (
    <form action={action} className="mt-6 flex flex-col gap-3 rounded-lg border p-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm">{t("notebookTitle")}</span>
        <input name="title" required className="min-h-11 rounded-md border px-3" />
      </label>
      <ErrorText state={state} />
      <button type="submit" disabled={pending} className="min-h-11 self-start rounded-md bg-black px-4 text-white">
        {t("createNotebook")}
      </button>
    </form>
  );
}

export function NewPageButton({ notebookId }: { notebookId: string }) {
  const [state, action, pending] = useActionState(createPageAction.bind(null, notebookId), null);
  return (
    <form action={action} className="mt-6 flex flex-col gap-2">
      <ErrorText state={state} />
      <button type="submit" disabled={pending} className="min-h-11 self-start rounded-md bg-black px-4 text-white">
        {t("newPage")}
      </button>
    </form>
  );
}
