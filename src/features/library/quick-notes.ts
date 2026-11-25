import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { PASTELS } from "@/ui/pastel";

type Client = SupabaseClient<Database>;

export const QUICK_SUBJECT = "Quick notes";
export const QUICK_NOTEBOOK = "Pages";
const LAVENDER = PASTELS.find((p) => p.id === "lavender")!.hex;

type Row = { id: string; created_at: string };

async function listSubjects(db: Client, ownerId: string): Promise<Row[]> {
  const { data, error } = await db
    .from("subjects")
    .select("id, created_at")
    .eq("owner_id", ownerId)
    .eq("name", QUICK_SUBJECT)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

async function listNotebooks(db: Client, ownerId: string, subjectId: string): Promise<Row[]> {
  const { data, error } = await db
    .from("notebooks")
    .select("id, created_at")
    .eq("owner_id", ownerId)
    .eq("subject_id", subjectId)
    .eq("title", QUICK_NOTEBOOK)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Finds or creates the user's "Quick notes" subject and its "Pages" notebook, returning the notebook id.
 * There is no unique constraint, so concurrent first taps can insert duplicates. Every request picks the
 * first row ordered by (created_at, id), so they converge on the same one.
 *
 * Deliberately there is no cleanup and no deletes at all: subjects and notebooks cascade on delete, and a
 * check-then-delete cannot be made atomic from the client, so a notebook or page added under a duplicate
 * between the check and the delete would be silently lost. An empty duplicate is harmless. The proper fix
 * is a partial unique index (owner_id, name) on the Quick notes subject, which needs a migration.
 */
export async function ensureQuickNotebook(db: Client, ownerId: string): Promise<string> {
  let subjects = await listSubjects(db, ownerId);
  if (!subjects.length) {
    const { data: last, error: lastErr } = await db
      .from("subjects")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    if (lastErr) throw new Error(lastErr.message);
    const { error } = await db
      .from("subjects")
      .insert({ name: QUICK_SUBJECT, color: LAVENDER, sort_order: last.length ? last[0].sort_order + 1 : 0 });
    if (error) throw new Error(error.message);
    subjects = await listSubjects(db, ownerId);
  }
  const subject = subjects[0];
  if (!subject) throw new Error("Quick notes subject missing");

  let notebooks = await listNotebooks(db, ownerId, subject.id);
  if (!notebooks.length) {
    const { error } = await db.from("notebooks").insert({ subject_id: subject.id, title: QUICK_NOTEBOOK });
    if (error) throw new Error(error.message);
    notebooks = await listNotebooks(db, ownerId, subject.id);
  }
  const notebook = notebooks[0];
  if (!notebook) throw new Error("Quick notes notebook missing");
  return notebook.id;
}

/** A valid IANA zone name, else "UTC". */
export function safeTimeZone(tz: unknown): string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** "Page · 25 Nov": the date in the user's time zone (falls back to UTC). */
export function quickPageTitle(now: Date, tz?: unknown, locale = "en-GB"): string {
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: safeTimeZone(tz) }).format(now);
  return `Page · ${day}`;
}
