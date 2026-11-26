import type { SupabaseClient } from "@supabase/supabase-js";
import { previewPath, SIGNED_URL_TTL_S } from "@/canvas/attachments/upload";
import type { Database } from "@/lib/supabase/types";

/*
 * Card previews: `{owner}/{page}/preview.jpg`, written by the canvas (see src/canvas/preview). Cards show them
 * through signed URLs carrying `v=<pages.updated_at>`; the canvas bumps pages.updated_at after each re-upload, so a
 * new picture always has a new URL. Client-safe (no server imports): touchPage runs in the browser.
 */

/** The slice of a Supabase client used to sign previews. */
export interface PreviewSigner {
  storage: {
    from(bucket: string): {
      createSignedUrls(
        paths: string[],
        expiresIn: number,
      ): Promise<{ data: { path: string | null; signedUrl: string | null; error: string | null }[] | null; error: unknown }>;
    };
  };
}

/** Adds the cache-busting version to a signed URL. */
export function withVersion(url: string, version: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}

/**
 * Signed preview URLs by page id, in one request. Pages without a preview (or any failure) are left out, so their
 * cards show the placeholder. Never rejects.
 */
export async function signPreviewUrls(
  client: PreviewSigner,
  ownerId: string,
  pages: { id: string; updated_at: string }[],
): Promise<Record<string, string>> {
  if (pages.length === 0) return {};
  const byPath = new Map(pages.map((p) => [previewPath(ownerId, p.id), p]));
  try {
    const { data, error } = await client.storage.from("attachments").createSignedUrls([...byPath.keys()], SIGNED_URL_TTL_S);
    if (error || !data) return {};
    const out: Record<string, string> = {};
    for (const item of data) {
      const page = item.path ? byPath.get(item.path) : undefined;
      if (!page || item.error || !item.signedUrl) continue;
      out[page.id] = withVersion(item.signedUrl, page.updated_at);
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Bumps pages.updated_at (the set_updated_at trigger stamps now()) after a new preview was uploaded, so the cards'
 * URLs change. Owner-scoped. Rejects on failure.
 */
export async function touchPage(db: SupabaseClient<Database>, ownerId: string, pageId: string): Promise<void> {
  const { error } = await db.from("pages").update({ updated_at: new Date().toISOString() }).eq("id", pageId).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
}
