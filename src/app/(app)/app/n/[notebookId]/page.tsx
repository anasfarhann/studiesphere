import Link from "next/link";
import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseLibraryRepo } from "@/features/library/supabase-repo";
import { createPageAction } from "@/features/library/actions";
import { getNotebook } from "@/features/library/lookups";
import { t } from "@/i18n/en";

export default async function NotebookPage({ params }: { params: Promise<{ notebookId: string }> }) {
  await getUser();
  const { notebookId } = await params;
  const notebook = await getNotebook(notebookId);
  const pages = await new SupabaseLibraryRepo(await createServerClient()).listPages(notebook.id);
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Link href={`/app/s/${notebook.subject_id}`} className="inline-flex min-h-11 items-center text-sm underline">
        {t("backToSubjects")}
      </Link>
      <h1 className="text-2xl font-semibold">{notebook.title}</h1>

      <form action={createPageAction.bind(null, notebook.id)} className="mt-6">
        <button type="submit" className="min-h-11 rounded-md bg-black px-4 text-white">
          {t("newPage")}
        </button>
      </form>

      {pages.length === 0 ? (
        <p className="mt-6 opacity-70">{t("noPages")}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {pages.map((p) => (
            <li key={p.id}>
              <Link href={`/app/p/${p.id}`} className="flex min-h-11 items-center rounded-lg border px-4 py-3">
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
