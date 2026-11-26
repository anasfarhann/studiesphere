import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseLibraryRepo } from "@/features/library/supabase-repo";
import { getPagesWithAudio, getSubject } from "@/features/library/lookups";
import { signPreviewUrls } from "@/features/library/previews";
import { FolderView } from "@/features/library/views";

/** A folder (a `subjects` row): every page in it, across all its notebooks. */
export default async function FolderPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const user = await getUser();
  const { subjectId } = await params;
  const folder = await getSubject(subjectId);
  const db = await createServerClient();
  const repo = new SupabaseLibraryRepo(db);
  const [pages, folders] = await Promise.all([repo.listFolderPages(folder.id), repo.listSubjects()]);
  const [audioPageIds, previewUrls] = await Promise.all([getPagesWithAudio(pages.map((p) => p.id)), signPreviewUrls(db, user.id, pages)]);
  return (
    <FolderView
      folder={folder}
      pages={pages}
      audioPageIds={audioPageIds}
      previewUrls={previewUrls}
      folders={folders.map((f) => ({ id: f.id, name: f.name }))}
    />
  );
}
