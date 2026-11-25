import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { PASTELS } from "@/ui/pastel";

type Client = SupabaseClient<Database>;

export const QUICK_SUBJECT = "Quick notes";
export const QUICK_NOTEBOOK = "Pages";
const LAVENDER = PASTELS.find((p) => p.id === "lavender")!.hex;

async function oldestSubject(db: Client, ownerId: string): Promise<string | null> {
  const { data, error } = await db
    .from("subjects")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("name", QUICK_SUBJECT)
    .order("created_at")
    .order("id")
    .limit(1);
  if (error) throw new Error(error.message);
  return data.length ? data[0].id : null;
}

async function oldestNotebook(db: Client, ownerId: string, subjectId: string): Promise<string | null> {
  const { data, error } = await db
    .from("notebooks")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("subject_id", subjectId)
    .eq("title", QUICK_NOTEBOOK)
    .order("created_at")
    .order("id")
    .limit(1);
  if (error) throw new Error(error.message);
  return data.length ? data[0].id : null;
}

/**
 * Finds or creates the user's "Quick notes" subject and its "Pages" notebook, returning the notebook id.
 * There is no unique constraint, so after inserting we re-select oldest-first and keep the oldest row,
 * deleting our own insert if a concurrent request won. Everyone converges on the same oldest row.
 */
export async function ensureQuickNotebook(db: Client, ownerId: string): Promise<string> {
  let subjectId = await oldestSubject(db, ownerId);
  if (!subjectId) {
    const { data: last, error: lastErr } = await db
      .from("subjects")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    if (lastErr) throw new Error(lastErr.message);
    const { data, error } = await db
      .from("subjects")
      .insert({ name: QUICK_SUBJECT, color: LAVENDER, sort_order: last.length ? last[0].sort_order + 1 : 0 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const winner = (await oldestSubject(db, ownerId)) ?? data.id;
    if (winner !== data.id) {
      const { error: delErr } = await db.from("subjects").delete().eq("id", data.id);
      if (delErr) throw new Error(delErr.message);
    }
    subjectId = winner;
  }

  let notebookId = await oldestNotebook(db, ownerId, subjectId);
  if (!notebookId) {
    const { data, error } = await db
      .from("notebooks")
      .insert({ subject_id: subjectId, title: QUICK_NOTEBOOK })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const winner = (await oldestNotebook(db, ownerId, subjectId)) ?? data.id;
    if (winner !== data.id) {
      const { error: delErr } = await db.from("notebooks").delete().eq("id", data.id);
      if (delErr) throw new Error(delErr.message);
    }
    notebookId = winner;
  }
  return notebookId;
}

/** "Page · 25 Nov" in the given locale (English by default). */
export function quickPageTitle(now: Date, locale = "en-GB"): string {
  return `Page · ${now.toLocaleDateString(locale, { day: "numeric", month: "short" })}`;
}
