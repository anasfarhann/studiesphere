// @vitest-environment node
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { SupabaseSnapshotStore } from "@/canvas/persistence/supabase-snapshot-store";
import type { StrokeEl } from "@/canvas/model/types";
import type { Database } from "@/lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);

const stroke = (id: string): StrokeEl => ({
  id, z: 0, updatedAt: 1000, type: "stroke", tool: "pen", color: "#000", size: 4,
  points: [[1, 2, 0.5]], simulatePressure: false,
});

describe.skipIf(!configured)("SupabaseSnapshotStore + create_snapshot", () => {
  const createdUserIds: string[] = [];
  const admin = createClient<Database>(url ?? "http://localhost", serviceKey ?? "x", {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function signedInClient(label: string): Promise<SupabaseClient<Database>> {
    const email = `snap-${label}-${randomUUID()}@example.test`;
    const password = randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    createdUserIds.push(data.user.id);
    const client = createClient<Database>(url ?? "", anonKey ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
    return client;
  }

  async function newPage(client: SupabaseClient<Database>): Promise<string> {
    const { data: s } = await client.from("subjects").insert({ name: "Bio", color: "#4f8" }).select().single();
    const { data: n } = await client.from("notebooks").insert({ subject_id: s!.id, title: "N" }).select().single();
    const { data: p } = await client.from("pages").insert({ notebook_id: n!.id }).select().single();
    return p!.id;
  }

  afterAll(async () => {
    for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
  });

  it("round-trips a snapshot and keeps only the latest 30", async () => {
    const client = await signedInClient("a");
    const page = await newPage(client);
    const store = new SupabaseSnapshotStore(client);
    expect(await store.latestAt(page)).toBeNull();
    for (let i = 0; i < 31; i++) await store.create(page, [stroke(`e${i}`)]);
    const list = await store.list(page);
    expect(list).toHaveLength(30);
    expect(list[0].elementCount).toBe(1);
    expect((await store.load(list[0].id)).map((e) => e.id)).toEqual(["e30"]);
    expect(await store.latestAt(page)).toBe(list[0].createdAt);
  });

  it("another user cannot read or create snapshots for my page", async () => {
    const owner = await signedInClient("o");
    const other = await signedInClient("x");
    const page = await newPage(owner);
    await new SupabaseSnapshotStore(owner).create(page, [stroke("a")]);
    expect(await new SupabaseSnapshotStore(other).list(page)).toEqual([]);
    await expect(new SupabaseSnapshotStore(other).create(page, [stroke("b")])).rejects.toThrow();
  });
});
