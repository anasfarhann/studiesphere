import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseLibraryRepo } from "@/features/library/supabase-repo";
import { getPagesWithAudio, getSubject } from "@/features/library/lookups";
import { FolderView } from "@/features/library/views";

/** A folder (a `subjects` row): every page in it, across all its notebooks. */
export default async function FolderPage({ params }: { params: Promise<{ subjectId: string }> }) {
  await getUser();
  const { subjectId } = await params;
  const folder = await getSubject(subjectId);
  const repo = new SupabaseLibraryRepo(await createServerClient());
  const [pages, folders] = await Promise.all([repo.listFolderPages(folder.id), repo.listSubjects()]);
  const audioPageIds = await getPagesWithAudio(pages.map((p) => p.id));
  return <FolderView folder={folder} pages={pages} audioPageIds={audioPageIds} folders={folders.map((f) => ({ id: f.id, name: f.name }))} />;
}
