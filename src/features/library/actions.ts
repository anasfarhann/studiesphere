"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { SUBJECT_COLORS } from "./colors";
import { toFormError, type FormState } from "./form-error";
import { SupabaseLibraryRepo } from "./supabase-repo";

async function repo() {
  await getUser(); // redirects to /login when signed out
  return new SupabaseLibraryRepo(await createServerClient());
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "");

// redirect() throws, so it must stay outside the try blocks.
export async function createSubjectAction(_prev: FormState, form: FormData): Promise<FormState> {
  const color = text(form, "color");
  const valid = SUBJECT_COLORS.some((c) => c.hex === color) ? color : SUBJECT_COLORS[0].hex;
  let id: string;
  try {
    id = (await (await repo()).createSubject({ name: text(form, "name"), color: valid })).id;
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/app");
  redirect(`/app/s/${id}`);
}

export async function createNotebookAction(subjectId: string, _prev: FormState, form: FormData): Promise<FormState> {
  let id: string;
  try {
    id = (await (await repo()).createNotebook(subjectId, text(form, "title"))).id;
  } catch (e) {
    return toFormError(e);
  }
  redirect(`/app/n/${id}`);
}

export async function createPageAction(notebookId: string): Promise<FormState> {
  let id: string;
  try {
    id = (await (await repo()).createPage(notebookId)).id;
  } catch (e) {
    return toFormError(e);
  }
  redirect(`/app/p/${id}`);
}
