import Link from "next/link";
import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseLibraryRepo } from "@/features/library/supabase-repo";
import { createNotebookAction } from "@/features/library/actions";
import { getSubject } from "@/features/library/lookups";
import { t } from "@/i18n/en";

export default async function SubjectPage({ params }: { params: Promise<{ subjectId: string }> }) {
  await getUser();
  const { subjectId } = await params;
  const subject = await getSubject(subjectId);
  const notebooks = await new SupabaseLibraryRepo(await createServerClient()).listNotebooks(subject.id);
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Link href="/app" className="inline-flex min-h-11 items-center text-sm underline">
        {t("backToSubjects")}
      </Link>
      <h1 className="flex items-center gap-3 text-2xl font-semibold">
        <span className="size-4 rounded-full" style={{ backgroundColor: subject.color }} aria-hidden />
        {subject.name}
      </h1>

      <form action={createNotebookAction.bind(null, subject.id)} className="mt-6 flex flex-col gap-3 rounded-lg border p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm">{t("notebookTitle")}</span>
          <input name="title" required className="min-h-11 rounded-md border px-3" />
        </label>
        <button type="submit" className="min-h-11 self-start rounded-md bg-black px-4 text-white">
          {t("createNotebook")}
        </button>
      </form>

      {notebooks.length === 0 ? (
        <p className="mt-6 opacity-70">{t("noNotebooks")}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {notebooks.map((n) => (
            <li key={n.id}>
              <Link href={`/app/n/${n.id}`} className="flex min-h-11 items-center rounded-lg border px-4 py-3">
                {n.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
