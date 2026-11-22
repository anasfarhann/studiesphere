import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

/** Returns the signed-in user, or redirects to /login. */
export async function getUser(): Promise<User> {
  const supabase = await createServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return data.user;
}
