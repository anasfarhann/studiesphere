import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { CanvasElement } from "../model/types";
import { ElementStoreError, STATEMENT_TIMEOUT_CODE, type ElementStore, type Tombstone } from "./store";

const ELEMENT_TYPES = new Set<string>(["stroke", "text", "image", "audio", "file"]);
/** PostgREST caps a response at 1000 rows by default; pages can hold many more strokes. */
const PAGE_SIZE = 1000;
/** Most rows (upserts + deletes) per save_elements call, so one big batch is never one huge request. */
export const SAVE_CHUNK_SIZE = 300;
/** 4xx answers that are about the session or load, not the data: retried. */
const RETRYABLE_STATUS = new Set([401, 403, 408, 429]);

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

/**
 * Network failures and 5xx/auth/rate-limit answers are retried. The data itself being refused
 * (Postgres 22xxx data exceptions, 23xxx constraints, 42xxx except 42501 permission, or any other
 * 4xx but 401/403/408/429) can never succeed by resending: marked permanent.
 */
export function toStoreError(e: PostgrestLikeError, status?: number): ElementStoreError {
  if (isNetworkError(e) || status === 0) return new ElementStoreError(e.message, true, { code: e.code });
  const code = e.code ?? "";
  if (code === STATEMENT_TIMEOUT_CODE || code === "42501") return new ElementStoreError(e.message, false, { code });
  const permanent =
    /^2[23]/.test(code) ||
    /^42/.test(code) ||
    (status !== undefined && status >= 400 && status < 500 && !RETRYABLE_STATUS.has(status));
  return new ElementStoreError(e.message, false, { permanent, code: e.code });
}

type SaveItem = { kind: "row"; el: CanvasElement } | { kind: "delete"; d: Tombstone };

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

  /**
   * Sent in chunks of SAVE_CHUNK_SIZE, one after another. Last-write-wins per element makes a
   * partly applied batch safe and resending it idempotent, so a failure part-way just rethrows.
   */
  async save(pageId: string, upserts: CanvasElement[], deletes: Tombstone[]): Promise<void> {
    const items: SaveItem[] = [
      ...upserts.map((el): SaveItem => ({ kind: "row", el })),
      ...deletes.map((d): SaveItem => ({ kind: "delete", d })),
    ];
    for (let i = 0; i < items.length; i += SAVE_CHUNK_SIZE) {
      const chunk = items.slice(i, i + SAVE_CHUNK_SIZE);
      const rows: CanvasElement[] = [];
      const dels: Tombstone[] = [];
      for (const it of chunk) {
        if (it.kind === "row") rows.push(it.el);
        else dels.push(it.d);
      }
      await this.saveChunk(pageId, rows, dels);
    }
  }

  private async saveChunk(pageId: string, upserts: CanvasElement[], deletes: Tombstone[]): Promise<void> {
    let res;
    try {
      res = await this.client.rpc("save_elements", {
        p_page: pageId,
        p_rows: upserts.map(rowFromElement),
        p_deleted: deletes.map((d) => ({ id: d.id, updated_at: new Date(d.updatedAt).toISOString() })),
      });
    } catch (e) {
      throw new ElementStoreError(e instanceof Error ? e.message : String(e), true);
    }
    if (res.error) throw toStoreError(res.error, res.status);
  }
}
