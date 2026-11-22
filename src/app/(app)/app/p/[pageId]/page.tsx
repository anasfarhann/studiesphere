import Link from "next/link";
import { getUser } from "@/lib/auth";
import { getPage } from "@/features/library/lookups";
import { t } from "@/i18n/en";

// Placeholder: Task 10 replaces this with the canvas.
export default async function CanvasPage({ params }: { params: Promise<{ pageId: string }> }) {
  await getUser();
  const { pageId } = await params;
  const page = await getPage(pageId);
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Link href={`/app/n/${page.notebook_id}`} className="inline-flex min-h-11 items-center text-sm underline">
        {t("backToSubjects")}
      </Link>
      <h1 className="text-2xl font-semibold">{page.title}</h1>
      <p className="mt-4 opacity-70">{t("canvasComingSoon")}</p>
    </main>
  );
}
