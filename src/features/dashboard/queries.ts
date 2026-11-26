import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { t } from "@/i18n/en";
import { toPastel } from "@/ui/pastel";
import { signPreviewUrls } from "@/features/library/previews";

export type RecentPage = {
  id: string;
  title: string;
  folderId: string;
  folderName: string;
  tint: string;
  editedAt: string;
  /** Signed, cache-busted URL of the page's preview; absent when it has none (the card shows the placeholder). */
  previewUrl?: string;
};
/** A folder (a `subjects` row) with the number of pages across all its notebooks. */
export type FolderSummary = { id: string; name: string; tint: string; pages: number };

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

type PageRow = { id: string; title: string; notebook_id: string; updated_at: string };

const time = (iso: string) => {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Merges pages found through recent element edits with the most recently updated pages (a blank, just-created
 * page has no elements): each page's time is the later of its newest element edit and pages.updated_at.
 * Deduped by id, newest first, at most `limit`.
 */
export function mergeRecent(
  edited: { pageId: string; editedAt: string }[],
  pages: PageRow[],
  limit: number,
): (PageRow & { editedAt: string })[] {
  const editedAt = new Map(edited.map((p) => [p.pageId, p.editedAt]));
  const byId = new Map<string, PageRow & { editedAt: string }>();
  for (const p of pages) {
    if (byId.has(p.id)) continue;
    const e = editedAt.get(p.id);
    byId.set(p.id, { ...p, editedAt: e !== undefined && time(e) > time(p.updated_at) ? e : p.updated_at });
  }
  return [...byId.values()].sort((a, b) => time(b.editedAt) - time(a.editedAt)).slice(0, limit);
}

/** Last edit = newest canvas element change per page, or pages.updated_at when later (or no elements). */
export async function getRecentPages(limit = 3): Promise<RecentPage[]> {
  const user = await getUser();
  const db = await createServerClient();

  const els = await db.from("canvas_elements").select("page_id, updated_at").order("updated_at", { ascending: false }).limit(200);
  if (els.error) throw new Error(els.error.message);
  const picked = pickRecent(els.data, limit);

  // Always also the newest pages by pages.updated_at, so a blank page created just now is a candidate.
  const [editedRows, newest] = await Promise.all([
    picked.length > 0
      ? db.from("pages").select("id, title, notebook_id, updated_at").in("id", picked.map((p) => p.pageId))
      : Promise.resolve({ data: [] as PageRow[], error: null }),
    db.from("pages").select("id, title, notebook_id, updated_at").eq("owner_id", user.id).order("updated_at", { ascending: false }).limit(limit),
  ]);
  if (editedRows.error) throw new Error(editedRows.error.message);
  if (newest.error) throw new Error(newest.error.message);
  const pageRows = mergeRecent(picked, [...editedRows.data, ...newest.data], limit);
  if (pageRows.length === 0) return [];

  const [nbs, previews] = await Promise.all([
    db.from("notebooks").select("id, subject_id").in("id", [...new Set(pageRows.map((p) => p.notebook_id))]),
    signPreviewUrls(db, user.id, pageRows),
  ]);
  if (nbs.error) throw new Error(nbs.error.message);
  const subs = await db.from("subjects").select("id, name, color").in("id", [...new Set(nbs.data.map((n) => n.subject_id))]);
  if (subs.error) throw new Error(subs.error.message);
  const nbById = new Map(nbs.data.map((n) => [n.id, n]));
  const subById = new Map(subs.data.map((s) => [s.id, s]));

  return pageRows.map((p) => {
    const nb = nbById.get(p.notebook_id);
    const sub = nb && subById.get(nb.subject_id);
    return {
      id: p.id,
      title: p.title,
      folderId: nb?.subject_id ?? "",
      folderName: sub?.name ?? "",
      tint: toPastel(sub?.color ?? ""),
      editedAt: p.editedAt,
      ...(previews[p.id] ? { previewUrl: previews[p.id] } : {}),
    };
  });
}

export async function getFolderSummaries(): Promise<FolderSummary[]> {
  await getUser();
  const db = await createServerClient();
  const [subs, nbs, pgs] = await Promise.all([
    db.from("subjects").select("id, name, color").order("sort_order").order("created_at"),
    db.from("notebooks").select("id, subject_id"),
    db.from("pages").select("id, notebook_id"),
  ]);
  for (const r of [subs, nbs, pgs]) if (r.error) throw new Error(r.error.message);
  const subjectOf = new Map<string, string>();
  for (const n of nbs.data ?? []) subjectOf.set(n.id, n.subject_id);
  const pageCount = new Map<string, number>();
  for (const p of pgs.data ?? []) {
    const sid = subjectOf.get(p.notebook_id);
    if (sid) pageCount.set(sid, (pageCount.get(sid) ?? 0) + 1);
  }
  return (subs.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    tint: toPastel(s.color),
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
