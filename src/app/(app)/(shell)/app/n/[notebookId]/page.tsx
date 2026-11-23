import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseLibraryRepo } from "@/features/library/supabase-repo";
import { getNotebook, getPagesWithAudio, getSubject } from "@/features/library/lookups";
import { NotebookView } from "@/features/library/views";

export default async function NotebookPage({ params }: { params: Promise<{ notebookId: string }> }) {
  await getUser();
  const { notebookId } = await params;
  const notebook = await getNotebook(notebookId);
  const subject = await getSubject(notebook.subject_id);
  const pages = await new SupabaseLibraryRepo(await createServerClient()).listPages(notebook.id);
  const audioPageIds = await getPagesWithAudio(pages.map((p) => p.id));
  return <NotebookView subject={subject} notebook={notebook} pages={pages} audioPageIds={audioPageIds} />;
}
