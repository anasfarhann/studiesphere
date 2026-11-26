import { getUser } from "@/lib/auth";
import { getNotebook, getPage, getSubject } from "@/features/library/lookups";
import { CanvasTitlePill } from "./CanvasTitlePill";
import { PageCanvas } from "./PageCanvas";

export default async function CanvasPage({ params }: { params: Promise<{ pageId: string }> }) {
  const user = await getUser();
  const { pageId } = await params;
  const page = await getPage(pageId);
  const notebook = await getNotebook(page.notebook_id);
  const folder = await getSubject(notebook.subject_id);
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageCanvas
        pageId={page.id}
        ownerId={user.id}
        header={
<CanvasTitlePill backHref={`/app/s/${folder.id}`} title={page.title} folder={folder.name} pageId={page.id} />
        }
      />
    </main>
  );
}
