import { cache } from "react";
import { pagesWithAudio } from "./audio";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function db(id: string) {
  if (!UUID.test(id)) notFound();
  return createServerClient();
}

export const getSubject = cache(async (id: string) => {
  const { data } = await (await db(id)).from("subjects").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return data;
});

export const getNotebook = cache(async (id: string) => {
  const { data } = await (await db(id)).from("notebooks").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return data;
});

export const getPage = cache(async (id: string) => {
  const { data } = await (await db(id)).from("pages").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return data;
});

/** Ids of pages (among `pageIds`) holding at least one non-deleted audio element: one grouped query. */
export async function getPagesWithAudio(pageIds: string[]): Promise<Set<string>> {
  if (pageIds.length === 0) return new Set();
  const { data, error } = await createServerClient().then((db) =>
    db.from("canvas_elements").select("page_id").eq("type", "audio").eq("deleted", false).in("page_id", pageIds),
  );
  if (error) throw new Error(error.message);
  return pagesWithAudio(data);
}
