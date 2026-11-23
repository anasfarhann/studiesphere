import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { ShellRail } from "@/ui/ShellRail";

async function signOut() {
  "use server";
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <div className="flex flex-1 flex-col gap-5 p-5 pb-28 md:flex-row md:pb-5">
      <ShellRail account={{ email: user.email ?? "", signOut }} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
