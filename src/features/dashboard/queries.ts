import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { t } from "@/i18n/en";
import { toPastel } from "@/ui/pastel";

export type RecentPage = {
  id: string;
  title: string;
  subjectName: string;
  notebookTitle: string;
  tint: string;
  editedAt: string;
};
export type SubjectSummary = { id: string; name: string; tint: string; notebooks: number; pages: number };

/** From rows ordered newest-first, the first `limit` distinct page ids with their newest edit time. */
export function pickRecent(
  rows: { page_id: string; updated_at: string }[],
  limit: number,
): { pageId: string; editedAt: string }[] {
  const seen = new Set<string>();
  const out: { pageId: string; editedAt: string }[] = [];
  for (const r of rows) {
    if (seen.has(r.page_id)) continue;
    seen.add(r.page_id);
    out.push({ pageId: r.page_id, editedAt: r.updated_at });
    if (out.length === limit) break;
  }
  return out;
}

/** Last edit = newest canvas element change per page; pages without elements fall back to pages.updated_at. RLS scopes every query. */
export async function getRecentPages(limit = 3): Promise<RecentPage[]> {
  await getUser();
  const db = await createServerClient();

  const els = await db.from("canvas_elements").select("page_id, updated_at").order("updated_at", { ascending: false }).limit(200);
  if (els.error) throw new Error(els.error.message);
  const picked = pickRecent(els.data, limit);
  const editedAt = new Map(picked.map((p) => [p.pageId, p.editedAt]));

  const pageRows: { id: string; title: string; notebook_id: string; updated_at: string }[] = [];
  if (picked.length > 0) {
    const r = await db.from("pages").select("id, title, notebook_id, updated_at").in("id", [...editedAt.keys()]);
    if (r.error) throw new Error(r.error.message);
    pageRows.push(...r.data);
  }
  if (pageRows.length < limit) {
    const r = await db
      .from("pages")
      .select("id, title, notebook_id, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit + pageRows.length);
    if (r.error) throw new Error(r.error.message);
    const have = new Set(pageRows.map((p) => p.id));
    for (const p of r.data) if (!have.has(p.id) && pageRows.length < limit) pageRows.push(p);
  }
  if (pageRows.length === 0) return [];

  const nbs = await db.from("notebooks").select("id, title, subject_id").in("id", [...new Set(pageRows.map((p) => p.notebook_id))]);
  if (nbs.error) throw new Error(nbs.error.message);
  const subs = await db.from("subjects").select("id, name, color").in("id", [...new Set(nbs.data.map((n) => n.subject_id))]);
  if (subs.error) throw new Error(subs.error.message);
  const nbById = new Map(nbs.data.map((n) => [n.id, n]));
  const subById = new Map(subs.data.map((s) => [s.id, s]));

  return pageRows
    .map((p) => {
      const nb = nbById.get(p.notebook_id);
      const sub = nb && subById.get(nb.subject_id);
      return {
        id: p.id,
        title: p.title,
        subjectName: sub?.name ?? "",
        notebookTitle: nb?.title ?? "",
        tint: toPastel(sub?.color ?? ""),
        editedAt: editedAt.get(p.id) ?? p.updated_at,
      };
    })
    .sort((a, b) => b.editedAt.localeCompare(a.editedAt))
    .slice(0, limit);
}

export async function getSubjectSummaries(): Promise<SubjectSummary[]> {
  await getUser();
  const db = await createServerClient();
  const [subs, nbs, pgs] = await Promise.all([
    db.from("subjects").select("id, name, color").order("sort_order").order("created_at"),
    db.from("notebooks").select("id, subject_id"),
    db.from("pages").select("id, notebook_id"),
  ]);
  for (const r of [subs, nbs, pgs]) if (r.error) throw new Error(r.error.message);
  const nbCount = new Map<string, number>();
  const subjectOf = new Map<string, string>();
  for (const n of nbs.data ?? []) {
    subjectOf.set(n.id, n.subject_id);
    nbCount.set(n.subject_id, (nbCount.get(n.subject_id) ?? 0) + 1);
  }
  const pageCount = new Map<string, number>();
  for (const p of pgs.data ?? []) {
    const sid = subjectOf.get(p.notebook_id);
    if (sid) pageCount.set(sid, (pageCount.get(sid) ?? 0) + 1);
  }
  return (subs.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    tint: toPastel(s.color),
    notebooks: nbCount.get(s.id) ?? 0,
    pages: pageCount.get(s.id) ?? 0,
  }));
}

/** Profile display name, else the email's local part, else a generic word; never empty. */
export function resolveDisplayName(displayName: string | null | undefined, email: string | undefined): string {
  return displayName?.trim() || (email ?? "").split("@")[0].trim() || t("dashGuestName");
}

export async function getDisplayName(): Promise<string> {
  const user = await getUser();
  const db = await createServerClient();
  const { data } = await db.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return resolveDisplayName(data?.display_name, user.email);
}
