import Link from "next/link";
import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { SupabaseLibraryRepo } from "@/features/library/supabase-repo";
import { createSubjectAction } from "@/features/library/actions";
import { SUBJECT_COLORS } from "@/features/library/colors";
import { t } from "@/i18n/en";

export default async function AppHome() {
  await getUser();
  const subjects = await new SupabaseLibraryRepo(await createServerClient()).listSubjects();
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">{t("appHomeTitle")}</h1>

      <form action={createSubjectAction} className="mt-6 flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-medium">{t("newSubject")}</h2>
        <label className="flex flex-col gap-1">
          <span className="text-sm">{t("subjectName")}</span>
          <input name="name" required className="min-h-11 rounded-md border px-3" />
        </label>
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mb-1 text-sm">{t("subjectColor")}</legend>
          {SUBJECT_COLORS.map((c, i) => (
            <label key={c.hex} className="relative inline-flex size-11 cursor-pointer items-center justify-center">
              <input
                type="radio"
                name="color"
                value={c.hex}
                defaultChecked={i === 0}
                aria-label={t(c.label)}
                className="peer sr-only"
              />
              <span
                className="size-9 rounded-full border-2 border-transparent peer-checked:border-black peer-checked:ring-2 peer-checked:ring-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
                style={{ backgroundColor: c.hex }}
              />
            </label>
          ))}
        </fieldset>
        <button type="submit" className="min-h-11 self-start rounded-md bg-black px-4 text-white">
          {t("createSubject")}
        </button>
      </form>

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
