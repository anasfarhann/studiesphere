"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { SUBJECT_COLORS } from "./colors";
import { SupabaseLibraryRepo } from "./supabase-repo";

async function repo() {
  await getUser(); // redirects to /login when signed out
  return new SupabaseLibraryRepo(await createServerClient());
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function createSubjectAction(form: FormData) {
  const color = text(form, "color");
  const valid = SUBJECT_COLORS.some((c) => c.hex === color) ? color : SUBJECT_COLORS[0].hex;
  const subject = await (await repo()).createSubject({ name: text(form, "name"), color: valid });
  revalidatePath("/app");
  redirect(`/app/s/${subject.id}`);
}

export async function createNotebookAction(subjectId: string, form: FormData) {
  const nb = await (await repo()).createNotebook(subjectId, text(form, "title"));
  redirect(`/app/n/${nb.id}`);
}

export async function createPageAction(notebookId: string) {
  const page = await (await repo()).createPage(notebookId);
  redirect(`/app/p/${page.id}`);
}
