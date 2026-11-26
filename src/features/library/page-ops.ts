import type { SupabaseClient } from "@supabase/supabase-js";
import { t } from "@/i18n/en";
import type { Database, Json } from "@/lib/supabase/types";
import { ensureFolderNotebook } from "./quick-notes";
import { requireName } from "./repo";
import { SupabaseLibraryRepo } from "./supabase-repo";
import type { Page } from "./types";

type Client = SupabaseClient<Database>;

/** Rows read per request (PostgREST caps a response at 1000) and rows written per insert. */
const READ_SIZE = 1000;
const WRITE_SIZE = 300;

/*
 * Every query here is scoped to the owner explicitly, on top of RLS. Nothing deletes except deletePage (the
 * user's confirmed delete) and the clean-up of a copy that failed half way.
 */

/** Pages updated/deleted by an owner-scoped query: an empty result means the page is not theirs (or gone). */
function requireHit(data: { id: string }[] | null) {
  if (!data?.length) throw new Error("Page not found");
}

export async function renamePage(db: Client, ownerId: string, pageId: string, title: string): Promise<void> {
  const clean = requireName(title);
  const { data, error } = await db.from("pages").update({ title: clean }).eq("id", pageId).eq("owner_id", ownerId).select("id");
  if (error) throw new Error(error.message);
  requireHit(data);
}

/** Deletes a page; its canvas elements and snapshots cascade in the database. Storage objects are left alone (a copy may share them). */
export async function deletePage(db: Client, ownerId: string, pageId: string): Promise<void> {
  const { data, error } = await db.from("pages").delete().eq("id", pageId).eq("owner_id", ownerId).select("id");
  if (error) throw new Error(error.message);
  requireHit(data);
}

/**
 * Moves a page into a folder by re-pointing it at the folder's hidden notebook. A single idempotent update:
 * running it twice (a retry, a refresh) leaves one page in the target and none duplicated.
 */
export async function movePage(db: Client, ownerId: string, pageId: string, folderId: string): Promise<void> {
  const { data: folder, error: folderErr } = await db.from("subjects").select("id").eq("id", folderId).eq("owner_id", ownerId);
  if (folderErr) throw new Error(folderErr.message);
  if (!folder?.length) throw new Error("Folder not found");
  const notebookId = await ensureFolderNotebook(db, ownerId, folderId);
  const { data, error } = await db.from("pages").update({ notebook_id: notebookId }).eq("id", pageId).eq("owner_id", ownerId).select("id");
  if (error) throw new Error(error.message);
  requireHit(data);
}

function isRecord(v: Json): v is { [key: string]: Json | undefined } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Copies a page into the same notebook as "<title> (copy)". Live canvas elements are copied with fresh ids
 * (the element's own id inside `data` is rewritten to match its row id); asset paths inside `data` are kept,
 * so the copy shares the uploaded files. Each row keeps its source `updated_at` unchanged: save_elements
 * resolves conflicts by client-stamped time, so a server-clock stamp could make a slow device clock lose
 * its first edits on the copy. If copying fails, the half-made copy is removed.
 */
export async function duplicatePage(db: Client, ownerId: string, pageId: string): Promise<Page> {
  const { data: src, error: srcErr } = await db.from("pages").select("*").eq("id", pageId).eq("owner_id", ownerId).single();
  if (srcErr || !src) throw new Error(srcErr?.message ?? "Page not found");
  const copy = await new SupabaseLibraryRepo(db).createPage(src.notebook_id, t("pageCopyTitle", { title: src.title || t("untitledPage") }));
  try {
    for (let from = 0; ; from += READ_SIZE) {
      const { data: rows, error } = await db
        .from("canvas_elements")
        .select("id, type, data, z, updated_at")
        .eq("page_id", pageId)
        .eq("owner_id", ownerId)
        .eq("deleted", false)
        .order("z")
        .order("id")
        .range(from, from + READ_SIZE - 1);
      if (error) throw new Error(error.message);
      const copies = rows.map((r) => {
        const id = crypto.randomUUID();
        return { id, owner_id: ownerId, page_id: copy.id, type: r.type, z: r.z, deleted: false, updated_at: r.updated_at, data: isRecord(r.data) ? { ...r.data, id } : r.data };
      });
      for (let i = 0; i < copies.length; i += WRITE_SIZE) {
        const { error: insErr } = await db.from("canvas_elements").insert(copies.slice(i, i + WRITE_SIZE));
        if (insErr) throw new Error(insErr.message);
      }
      if (rows.length < READ_SIZE) break;
    }
  } catch (e) {
    const { error: cleanupErr } = await db.from("pages").delete().eq("id", copy.id).eq("owner_id", ownerId);
    if (cleanupErr) console.error("duplicatePage: could not remove the partial copy", copy.id, cleanupErr.message);
    throw e;
  }
  return copy;
}
