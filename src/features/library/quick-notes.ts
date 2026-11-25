import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { PASTELS } from "@/ui/pastel";

type Client = SupabaseClient<Database>;

export const QUICK_SUBJECT = "Quick notes";
export const QUICK_NOTEBOOK = "Pages";
const LAVENDER = PASTELS.find((p) => p.id === "lavender")!.hex;

const STALE_MS = 2 * 60_000;

type Row = { id: string; created_at: string };

const age = (r: Row, now: Date) => now.getTime() - Date.parse(r.created_at);

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

/** Ids among `ids` that have at least one child row in `child` (so they must not be deleted). */
async function withChildren(db: Client, child: "notebooks" | "pages", fk: "subject_id" | "notebook_id", ids: string[]) {
  const { data, error } = await db.from(child).select(fk).in(fk, ids);
  if (error) throw new Error(error.message);
  return new Set((data as unknown as Record<string, string>[]).map((r) => r[fk]));
}

/** Deletes empty duplicates that are old enough that no in-flight request can still be using them. */
async function cleanup(db: Client, table: "subjects" | "notebooks", dupes: Row[], now: Date) {
  const old = dupes.filter((r) => age(r, now) > STALE_MS);
  if (!old.length) return;
  const used =
    table === "subjects"
      ? await withChildren(db, "notebooks", "subject_id", old.map((r) => r.id))
      : await withChildren(db, "pages", "notebook_id", old.map((r) => r.id));
  for (const r of old) {
    if (used.has(r.id)) continue;
    const { error } = await db.from(table).delete().eq("id", r.id);
    if (error) throw new Error(error.message);
  }
}

/**
 * Finds or creates the user's "Quick notes" subject and its "Pages" notebook, returning the notebook id.
 * There is no unique constraint, so concurrent first taps can insert duplicates. Every request picks the
 * first row ordered by (created_at, id), so they converge on the same one. A request never deletes what it
 * created (another request may already be using it); instead, duplicates that are empty and older than two
 * minutes are cleaned up on later calls.
 */
export async function ensureQuickNotebook(db: Client, ownerId: string, now: Date = new Date()): Promise<string> {
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
  await cleanup(db, "subjects", subjects.slice(1), now);

  let notebooks = await listNotebooks(db, ownerId, subject.id);
  if (!notebooks.length) {
    const { error } = await db.from("notebooks").insert({ subject_id: subject.id, title: QUICK_NOTEBOOK });
    if (error) throw new Error(error.message);
    notebooks = await listNotebooks(db, ownerId, subject.id);
  }
  const notebook = notebooks[0];
  if (!notebook) throw new Error("Quick notes notebook missing");
  await cleanup(db, "notebooks", notebooks.slice(1), now);
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
