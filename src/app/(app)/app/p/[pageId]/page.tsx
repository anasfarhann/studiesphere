import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getPage } from "@/features/library/lookups";
import { t } from "@/i18n/en";
import { PageCanvas } from "./PageCanvas";

export default async function CanvasPage({ params }: { params: Promise<{ pageId: string }> }) {
  const user = await getUser();
  const { pageId } = await params;
  const page = await getPage(pageId);
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b px-3">
        <Link href={`/app/n/${page.notebook_id}`} className="inline-flex min-h-11 items-center text-sm underline">
          {t("backToSubjects")}
        </Link>
        <h1 className="truncate text-base font-semibold">{page.title}</h1>
      </div>
      <PageCanvas pageId={page.id} ownerId={user.id} />
    </main>
  );
}
