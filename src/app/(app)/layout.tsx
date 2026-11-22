import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { t } from "@/i18n/en";

async function signOut() {
  "use server";
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">{t("appName")}</span>
        <form action={signOut} className="flex items-center gap-3">
          <span className="text-sm opacity-70">{user.email}</span>
          <button type="submit" className="rounded-md border px-3 py-1 text-sm">
            {t("signOut")}
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
