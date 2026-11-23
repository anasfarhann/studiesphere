import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { CanvasElement } from "../model/types";
import type { SnapshotMeta, SnapshotStore } from "./snapshot-store";
import { SNAPSHOT_KEEP } from "./snapshot-store";

function fail(e: { message: string }): never {
  throw new Error(e.message);
}

export class SupabaseSnapshotStore implements SnapshotStore {
  constructor(private client: SupabaseClient<Database>) {}

  async list(pageId: string): Promise<SnapshotMeta[]> {
    const res = await this.client
      .from("page_snapshots")
      .select("id, created_at, element_count")
      .eq("page_id", pageId)
      .order("created_at", { ascending: false })
      .limit(SNAPSHOT_KEEP);
    if (res.error) fail(res.error);
    return res.data.map((r) => ({ id: r.id, createdAt: Date.parse(r.created_at), elementCount: r.element_count }));
  }

  async latestAt(pageId: string): Promise<number | null> {
    const res = await this.client
      .from("page_snapshots")
      .select("created_at")
      .eq("page_id", pageId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (res.error) fail(res.error);
    return res.data.length > 0 ? Date.parse(res.data[0].created_at) : null;
  }

  async load(snapshotId: string): Promise<CanvasElement[]> {
    const res = await this.client.from("page_snapshots").select("elements").eq("id", snapshotId).single();
    if (res.error) fail(res.error);
    if (!Array.isArray(res.data.elements)) throw new Error("snapshot is malformed");
    return res.data.elements as unknown as CanvasElement[];
  }

  /** The server stamps created_at itself (`at` is only used by the memory store). */
  async create(pageId: string, elements: CanvasElement[]): Promise<void> {
    const res = await this.client.rpc("create_snapshot", { p_page: pageId, p_elements: elements as unknown as Json });
    if (res.error) fail(res.error);
  }
}
