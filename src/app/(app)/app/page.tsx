import Link from "next/link";
import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseLibraryRepo } from "@/features/library/supabase-repo";
import { SubjectForm } from "@/features/library/forms";
import { t } from "@/i18n/en";

export default async function AppHome() {
  await getUser();
  const subjects = await new SupabaseLibraryRepo(await createServerClient()).listSubjects();
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">{t("appHomeTitle")}</h1>

      <SubjectForm />

      {subjects.length === 0 ? (
        <p className="mt-6 opacity-70">{t("noSubjects")}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {subjects.map((s) => (
            <li key={s.id}>
              <Link href={`/app/s/${s.id}`} className="flex min-h-11 items-center gap-3 rounded-lg border px-4 py-3">
                <span className="size-4 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
