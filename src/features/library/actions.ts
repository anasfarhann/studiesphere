"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { SUBJECT_COLORS } from "./colors";
import { toFormError, type FormState } from "./form-error";
import { ensureFolderNotebook, ensureQuickNotebook, quickPageTitle } from "./quick-notes";
import { SupabaseLibraryRepo } from "./supabase-repo";

async function repo() {
  await getUser(); // redirects to /login when signed out
  return new SupabaseLibraryRepo(await createServerClient());
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "");

// redirect() throws, so it must stay outside the try blocks.
export async function createFolderAction(_prev: FormState, form: FormData): Promise<FormState> {
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

/** Renames a folder. Returns null on success so the dialog can close. */
export async function renameFolderAction(folderId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const r = await repo(); // auth redirect happens outside the try
  try {
    await r.renameSubject(folderId, text(form, "name"));
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/app");
  revalidatePath(`/app/s/${folderId}`);
  return null;
}

/** Deletes an empty folder and goes home; refused with a message while the folder has pages. */
export async function deleteFolderAction(folderId: string): Promise<FormState> {
  const r = await repo(); // auth redirect happens outside the try
  try {
    await r.deleteSubject(folderId);
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/app");
  redirect("/app");
}

/** "New page" inside a folder: a dated page in the folder's hidden notebook, then open it. */
export async function createFolderPageAction(folderId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await getUser(); // redirects to /login when signed out
  const supabase = await createServerClient();
  let id: string;
  try {
    const notebookId = await ensureFolderNotebook(supabase, user.id, folderId);
    id = (await new SupabaseLibraryRepo(supabase).createPage(notebookId, quickPageTitle(new Date(), form.get("tz")))).id;
  } catch (e) {
    return toFormError(e);
  }
  revalidatePath("/app");
  redirect(`/app/p/${id}`);
}

/** One-tap "New page": a page in the user's Quick notes folder, created on demand. */
export async function createQuickPageAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getUser(); // redirects to /login when signed out
  const supabase = await createServerClient();
  let id: string;
  try {
    const notebookId = await ensureQuickNotebook(supabase, user.id);
    id = (await new SupabaseLibraryRepo(supabase).createPage(notebookId, quickPageTitle(new Date(), form.get("tz")))).id;
  } catch (e) {
    // Shown inline next to the button (NewPageForm).
    return toFormError(e);
  }
  revalidatePath("/app");
  redirect(`/app/p/${id}`);
}
