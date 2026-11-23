import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseLibraryRepo } from "@/features/library/supabase-repo";
import { getPageCounts, getSubject } from "@/features/library/lookups";
import { SubjectView } from "@/features/library/views";

export default async function SubjectPage({ params }: { params: Promise<{ subjectId: string }> }) {
  await getUser();
  const { subjectId } = await params;
  const subject = await getSubject(subjectId);
  const notebooks = await new SupabaseLibraryRepo(await createServerClient()).listNotebooks(subject.id);
  const counts = await getPageCounts(notebooks.map((n) => n.id));
  return (
    <SubjectView
      subject={subject}
      notebooks={notebooks.map((n) => ({ id: n.id, title: n.title, pages: counts.get(n.id) ?? 0 }))}
    />
  );
}
