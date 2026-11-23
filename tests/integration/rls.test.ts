// @vitest-environment node
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anonKey && serviceKey);

describe.skipIf(!configured)("row-level security", () => {
  const createdUserIds: string[] = [];
  const admin = createClient<Database>(url ?? "http://localhost", serviceKey ?? "x", {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function signedInClient(
    label: string,
  ): Promise<{ client: SupabaseClient<Database>; userId: string }> {
    const email = `rls-${label}-${randomUUID()}@example.test`;
    const password = randomUUID();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    createdUserIds.push(data.user.id);
    const client = createClient<Database>(url ?? "", anonKey ?? "", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
    return { client, userId: data.user.id };
  }

  afterAll(async () => {
    for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
  });

  it("a user cannot read or write another user's rows", async () => {
    const { client: a } = await signedInClient("a");
    const { client: b } = await signedInClient("b");
    const { data: s, error } = await a
      .from("subjects")
      .insert({ name: "Bio", color: "#4f8" })
      .select()
      .single();
    expect(error).toBeNull();
    expect((await b.from("subjects").select().eq("id", s!.id)).data).toEqual([]);
    expect(
      (await b.from("subjects").update({ name: "x" }).eq("id", s!.id).select()).data,
    ).toEqual([]);
    expect((await b.from("subjects").delete().eq("id", s!.id).select()).data).toEqual([]);
    const { data: still } = await a.from("subjects").select().eq("id", s!.id).single();
    expect(still?.name).toBe("Bio");
  });

  it("a user cannot upload into another user's storage folder", async () => {
    const { client: a } = await signedInClient("a");
    const { userId: bId } = await signedInClient("b");
    const blob = new Blob(["hello"], { type: "text/plain" });
    const foreign = await a.storage
      .from("attachments")
      .upload(`${bId}/page/${randomUUID()}.txt`, blob);
    expect(foreign.error).not.toBeNull();
    const { data: me } = await a.auth.getUser();
    const own = await a.storage
      .from("attachments")
      .upload(`${me.user!.id}/page/${randomUUID()}.txt`, blob);
    expect(own.error).toBeNull();
  });

  it("a user cannot attach rows to another user's parent rows", async () => {
    const { client: a } = await signedInClient("a");
    const { client: b } = await signedInClient("b");
    const { data: s } = await a
      .from("subjects")
      .insert({ name: "Bio", color: "#4f8" })
      .select()
      .single();
    const bad = await b.from("notebooks").insert({ subject_id: s!.id, title: "sneaky" });
    expect(bad.error).not.toBeNull();
    const { data: nb } = await a.from("notebooks").select().eq("subject_id", s!.id);
    expect(nb).toEqual([]);
    const { data: own } = await b.from("subjects").insert({ name: "Mine", color: "#111" }).select().single();
    const { data: b2 } = await b.from("notebooks").insert({ subject_id: own!.id, title: "ok" }).select().single();
    expect(
      (await b.from("notebooks").update({ subject_id: s!.id }).eq("id", b2!.id)).error,
    ).not.toBeNull();
  });

  it("a user cannot change their own plan", async () => {
    const { client: a, userId } = await signedInClient("a");
    await a.from("profiles").update({ plan: "pro" }).eq("id", userId);
    const { data } = await a.from("profiles").select("plan").eq("id", userId).single();
    expect(data?.plan).toBe("free");
    expect((await a.from("profiles").delete().eq("id", userId)).error).not.toBeNull();
  });
});
