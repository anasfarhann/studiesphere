import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { CanvasElement } from "../model/types";
import { ElementStoreError, type ElementStore } from "./store";

const ELEMENT_TYPES = new Set<string>(["stroke", "text", "image", "audio", "file"]);
/** PostgREST caps a response at 1000 rows by default; pages can hold many more strokes. */
const PAGE_SIZE = 1000;

type Row = Pick<Database["public"]["Tables"]["canvas_elements"]["Row"], "id" | "type" | "data" | "z" | "updated_at">;
type PostgrestLikeError = { message: string; code?: string };

function isRecord(v: Json): v is { [key: string]: Json | undefined } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Rebuilds an element from its row: `data` holds the full element; the row's id, z and updated_at win. */
export function elementFromRow(row: Row): CanvasElement | null {
  const data = row.data;
  if (!isRecord(data)) return null;
  const type = typeof data.type === "string" ? data.type : row.type;
  if (!ELEMENT_TYPES.has(type)) return null;
  const updatedAt = Date.parse(row.updated_at);
  const el = { ...data, id: row.id, type, z: row.z, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 };
  return el as unknown as CanvasElement;
}

export function rowFromElement(el: CanvasElement): { id: string; type: string; data: Json; z: number; updated_at: string } {
  return {
    id: el.id,
    type: el.type,
    data: el as unknown as Json,
    z: el.z,
    updated_at: new Date(el.updatedAt).toISOString(),
  };
}

/** A failed fetch (no network, DNS, CORS, aborted) comes back with an empty code and a fetch-ish message. */
function isNetworkError(e: PostgrestLikeError): boolean {
  if (e.code) return false;
  return /fetch|network|load failed|abort/i.test(e.message);
}

function toStoreError(e: PostgrestLikeError): ElementStoreError {
  return new ElementStoreError(e.message, isNetworkError(e));
}

export class SupabaseElementStore implements ElementStore {
  constructor(private client: SupabaseClient<Database>) {}

  async load(pageId: string): Promise<CanvasElement[]> {
    const out: CanvasElement[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let res;
      try {
        res = await this.client
          .from("canvas_elements")
          .select("id, type, data, z, updated_at")
          .eq("page_id", pageId)
          .eq("deleted", false)
          .order("id")
          .range(from, from + PAGE_SIZE - 1);
      } catch (e) {
        throw new ElementStoreError(e instanceof Error ? e.message : String(e), true);
      }
      if (res.error) throw toStoreError(res.error);
      for (const row of res.data) {
        const el = elementFromRow(row);
        if (el) out.push(el);
      }
      if (res.data.length < PAGE_SIZE) break;
    }
    return out;
  }

  async save(pageId: string, upserts: CanvasElement[], deletes: string[]): Promise<void> {
    if (upserts.length === 0 && deletes.length === 0) return;
    let res;
    try {
      res = await this.client.rpc("save_elements", {
        p_page: pageId,
        p_rows: upserts.map(rowFromElement),
        p_deleted: deletes,
      });
    } catch (e) {
      throw new ElementStoreError(e instanceof Error ? e.message : String(e), true);
    }
    if (res.error) throw toStoreError(res.error);
  }
}
