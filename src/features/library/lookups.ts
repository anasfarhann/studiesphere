import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function db(id: string) {
  if (!UUID.test(id)) notFound();
  return createServerClient();
}

export async function getSubject(id: string) {
  const { data } = await (await db(id)).from("subjects").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return data;
}

export async function getNotebook(id: string) {
  const { data } = await (await db(id)).from("notebooks").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return data;
}

export async function getPage(id: string) {
  const { data } = await (await db(id)).from("pages").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return data;
}
