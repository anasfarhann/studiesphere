import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { FolderNotEmptyError, requireName, type LibraryRepo } from "./repo";
import type { Notebook, Page, Subject } from "./types";

type Client = SupabaseClient<Database>;

/** LibraryRepo backed by Supabase; RLS scopes every query to the signed-in user. */
export class SupabaseLibraryRepo implements LibraryRepo {
  constructor(private readonly db: Client) {}

  async listSubjects(): Promise<Subject[]> {
    const { data, error } = await this.db
      .from("subjects")
      .select("*")
      .order("sort_order")
      .order("created_at");
    if (error) throw new Error(error.message);
    return data;
  }

  async createSubject(input: { name: string; color: string }): Promise<Subject> {
    const name = requireName(input.name);
    const sort_order = await this.nextOrder("subjects");
    const { data, error } = await this.db
      .from("subjects")
      .insert({ name, color: input.color, sort_order })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async renameSubject(id: string, name: string): Promise<void> {
    const clean = requireName(name);
    const { error } = await this.db.from("subjects").update({ name: clean }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async deleteSubject(id: string): Promise<void> {
    // Refused while the folder has pages: notebooks and pages cascade in the database, and the UI offers no
    // cascade delete. (A page created in another tab between this check and the delete would still go with
    // the folder; closing that gap needs a database-side guard, i.e. a migration.)
    if ((await this.folderPageIds(id, 1)).length > 0) throw new FolderNotEmptyError();
    const { error } = await this.db.from("subjects").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listFolderPages(subjectId: string): Promise<Page[]> {
    const nbIds = await this.folderNotebookIds(subjectId);
    if (nbIds.length === 0) return [];
    const { data, error } = await this.db
      .from("pages")
      .select("*")
      .in("notebook_id", nbIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }

  private async folderNotebookIds(subjectId: string): Promise<string[]> {
    const { data, error } = await this.db.from("notebooks").select("id").eq("subject_id", subjectId);
    if (error) throw new Error(error.message);
    return data.map((n) => n.id);
  }

  private async folderPageIds(subjectId: string, limit: number): Promise<string[]> {
    const nbIds = await this.folderNotebookIds(subjectId);
    if (nbIds.length === 0) return [];
    const { data, error } = await this.db.from("pages").select("id").in("notebook_id", nbIds).limit(limit);
    if (error) throw new Error(error.message);
    return data.map((p) => p.id);
  }

  async listNotebooks(subjectId: string): Promise<Notebook[]> {
    const { data, error } = await this.db
      .from("notebooks")
      .select("*")
      .eq("subject_id", subjectId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return data;
  }

  async createNotebook(subjectId: string, title: string): Promise<Notebook> {
    const clean = requireName(title);
    const { data, error } = await this.db
      .from("notebooks")
      .insert({ subject_id: subjectId, title: clean })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async listPages(notebookId: string): Promise<Page[]> {
    const { data, error } = await this.db
      .from("pages")
      .select("*")
      .eq("notebook_id", notebookId)
      .order("sort_order")
      .order("created_at");
    if (error) throw new Error(error.message);
    return data;
  }

  async createPage(notebookId: string, title = "Untitled"): Promise<Page> {
    const { data: last, error: lastErr } = await this.db
      .from("pages")
      .select("sort_order")
      .eq("notebook_id", notebookId)
      .order("sort_order", { ascending: false })
      .limit(1);
    if (lastErr) throw new Error(lastErr.message);
    const sort_order = last.length ? last[0].sort_order + 1 : 0;
    const { data, error } = await this.db
      .from("pages")
      .insert({ notebook_id: notebookId, title, sort_order })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  private async nextOrder(table: "subjects"): Promise<number> {
    const { data, error } = await this.db
      .from(table)
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    return data.length ? data[0].sort_order + 1 : 0;
  }
}
