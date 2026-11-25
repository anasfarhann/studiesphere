"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { SUBJECT_COLORS } from "./colors";
import { toFormError, type FormState } from "./form-error";
import { ensureQuickNotebook, quickPageTitle } from "./quick-notes";
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
  const r = await repo(); // auth redirect happens outside the try
  let id: string;
  try {
    id = (await r.createSubject({ name: text(form, "name"), color: valid })).id;
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/app");
  redirect(`/app/s/${id}`);
}

export async function createNotebookAction(subjectId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const r = await repo(); // auth redirect happens outside the try
  let id: string;
  try {
    id = (await r.createNotebook(subjectId, text(form, "title"))).id;
  } catch (e) {
    return toFormError(e);
  }
  redirect(`/app/n/${id}`);
}

export async function createPageAction(notebookId: string): Promise<FormState> {
  const r = await repo(); // auth redirect happens outside the try
  let id: string;
  try {
    id = (await r.createPage(notebookId)).id;
  } catch (e) {
    return toFormError(e);
  }
  redirect(`/app/p/${id}`);
}

/** One-tap "New page": a page in the user's Quick notes subject, created on demand. */
export async function createQuickPageAction(): Promise<void> {
  const user = await getUser(); // redirects to /login when signed out
  const supabase = await createServerClient();
  let id: string;
  try {
    const notebookId = await ensureQuickNotebook(supabase, user.id);
    id = (await new SupabaseLibraryRepo(supabase).createPage(notebookId, quickPageTitle(new Date()))).id;
  } catch (e) {
    // A bare <form action> has no state to show an error in, so surface it to the error boundary.
    throw new Error(toFormError(e).error);
  }
  revalidatePath("/app");
  redirect(`/app/p/${id}`);
}
