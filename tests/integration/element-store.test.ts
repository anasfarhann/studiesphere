// @vitest-environment node
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { SupabaseElementStore } from "@/canvas/persistence/supabase-store";
import type { StrokeEl } from "@/canvas/model/types";
import type { Database } from "@/lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);

const stroke = (id: string, updatedAt: number, color = "#000", z = 0): StrokeEl => ({
  id, z, updatedAt, type: "stroke", tool: "pen", color, size: 4,
  points: [[1, 2, 0.5], [3, 4, 0.7]], simulatePressure: false,
});

describe.skipIf(!configured)("SupabaseElementStore + save_elements", () => {
  const createdUserIds: string[] = [];
  const admin = createClient<Database>(url ?? "http://localhost", serviceKey ?? "x", {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function signedInClient(label: string): Promise<SupabaseClient<Database>> {
    const email = `store-${label}-${randomUUID()}@example.test`;
    const password = randomUUID();
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    createdUserIds.push(data.user.id);
    const client = createClient<Database>(url ?? "", anonKey ?? "", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
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

  it("round-trips elements: data, z and updatedAt (ms) survive", async () => {
    const client = await signedInClient("a");
    const store = new SupabaseElementStore(client);
    const page = await newPage(client);
    const el = stroke(randomUUID(), 1_763_900_000_123, "#123456", 7);
    await store.save(page, [el], []);
    expect(await store.load(page)).toEqual([el]);
  });

  it("an older updatedAt never overwrites a newer row", async () => {
    const client = await signedInClient("a");
    const store = new SupabaseElementStore(client);
    const page = await newPage(client);
    const id = randomUUID();
    await store.save(page, [stroke(id, 2_000_000, "#new")], []);
    await store.save(page, [stroke(id, 1_000_000, "#old")], []);
    const [row] = await store.load(page);
    expect(row).toMatchObject({ color: "#new", updatedAt: 2_000_000 });
    await store.save(page, [stroke(id, 3_000_000, "#newer")], []);
    expect((await store.load(page))[0]).toMatchObject({ color: "#newer" });
  });

  it("deletes are tombstones a late older upsert cannot undo; unknown ids are a no-op", async () => {
    const client = await signedInClient("a");
    const store = new SupabaseElementStore(client);
    const page = await newPage(client);
    const id = randomUUID();
    const far = Date.now() + 86_400_000; // a device clock ahead of the server
    await store.save(page, [stroke(id, far)], []);
    await store.save(page, [], [{ id, updatedAt: far + 1 }, { id: randomUUID(), updatedAt: far + 1 }]);
    expect(await store.load(page)).toEqual([]);
    await store.save(page, [stroke(id, far)], []); // the same batch replayed late
    expect(await store.load(page)).toEqual([]);
    const { data } = await client.from("canvas_elements").select("deleted").eq("id", id).single();
    expect(data?.deleted).toBe(true);
  });

  it("deletes are last-write-wins: an older tombstone does not hide a newer upsert", async () => {
    const client = await signedInClient("a");
    const store = new SupabaseElementStore(client);
    const page = await newPage(client);
    const id = randomUUID();
    await store.save(page, [stroke(id, 2_000_000, "#newer")], []);
    await store.save(page, [], [{ id, updatedAt: 1_000_000 }]);
    expect(await store.load(page)).toHaveLength(1);
    await store.save(page, [stroke(id, 3_000_000, "#restored")], []);
    await store.save(page, [], [{ id, updatedAt: 2_500_000 }]);
    expect((await store.load(page))[0]).toMatchObject({ color: "#restored" });
  });

  it("loads pages larger than one PostgREST response (1000 rows)", async () => {
    const client = await signedInClient("a");
    const store = new SupabaseElementStore(client);
    const page = await newPage(client);
    const els = Array.from({ length: 1200 }, (_, i) => stroke(randomUUID(), 1_000_000 + i, "#000", i));
    for (let i = 0; i < els.length; i += 400) await store.save(page, els.slice(i, i + 400), []);
    expect((await store.load(page)).length).toBe(1200);
  });

  it("another user can neither write into my page nor overwrite my elements", async () => {
    const a = await signedInClient("a");
    const b = await signedInClient("b");
    const page = await newPage(a);
    const id = randomUUID();
    await new SupabaseElementStore(a).save(page, [stroke(id, 1_000_000, "#mine")], []);
    const bStore = new SupabaseElementStore(b);
    await expect(bStore.save(page, [stroke(randomUUID(), 1_000_000)], [])).rejects.toThrow();
    await bStore.save(page, [], [{ id, updatedAt: 9_000_000 }]).catch(() => undefined);
    await bStore.save(page, [stroke(id, 9_000_000, "#theirs")], []).catch(() => undefined);
    const mine = await new SupabaseElementStore(a).load(page);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id, color: "#mine" });
  });
});
