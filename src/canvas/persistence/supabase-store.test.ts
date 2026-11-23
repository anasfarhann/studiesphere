import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { StrokeEl } from "../model/types";
import { ElementStoreError } from "./store";
import { SAVE_CHUNK_SIZE, SupabaseElementStore, toStoreError } from "./supabase-store";

const stroke = (id: string): StrokeEl => ({
  id, z: 0, updatedAt: 1000, type: "stroke", tool: "pen", color: "#000", size: 2, points: [[0, 0, 0.5]], simulatePressure: true,
});

type RpcArgs = { p_page: string; p_rows: { id: string }[]; p_deleted: { id: string }[] };

function fakeClient(answer: (args: RpcArgs, call: number) => { error: { message: string; code?: string } | null; status: number }) {
  const calls: RpcArgs[] = [];
  const rpc = vi.fn(async (_fn: string, args: RpcArgs) => {
    calls.push(args);
    return { data: null, ...answer(args, calls.length) };
  });
  return { client: { rpc } as unknown as SupabaseClient<Database>, calls, rpc };
}

describe("SupabaseElementStore.save", () => {
  it(`sends 900 upserts as 3 RPCs of ${SAVE_CHUNK_SIZE}, in order`, async () => {
    const { client, calls } = fakeClient(() => ({ error: null, status: 204 }));
    const ups = Array.from({ length: 900 }, (_, i) => stroke(`e${i}`));
    await new SupabaseElementStore(client).save("pg", ups, []);
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.p_rows.length)).toEqual([300, 300, 300]);
    expect(calls.flatMap((c) => c.p_rows.map((r) => r.id))).toEqual(ups.map((e) => e.id));
    expect(calls.every((c) => c.p_page === "pg")).toBe(true);
  });

  it("chunks deletes too (upserts first, then deletes)", async () => {
    const { client, calls } = fakeClient(() => ({ error: null, status: 204 }));
    const ups = Array.from({ length: 250 }, (_, i) => stroke(`e${i}`));
    const dels = Array.from({ length: 400 }, (_, i) => ({ id: `d${i}`, updatedAt: 5 }));
    await new SupabaseElementStore(client).save("pg", ups, dels);
    expect(calls.map((c) => [c.p_rows.length, c.p_deleted.length])).toEqual([[250, 50], [0, 300], [0, 50]]);
  });

  it("nothing to save makes no call", async () => {
    const { client, rpc } = fakeClient(() => ({ error: null, status: 204 }));
    await new SupabaseElementStore(client).save("pg", [], []);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stops at the first failed chunk and rethrows (LWW makes the resend idempotent)", async () => {
    const { client, calls } = fakeClient((_a, n) => (n === 2 ? { error: { message: "boom", code: "XX000" }, status: 500 } : { error: null, status: 204 }));
    const ups = Array.from({ length: 900 }, (_, i) => stroke(`e${i}`));
    await expect(new SupabaseElementStore(client).save("pg", ups, [])).rejects.toBeInstanceOf(ElementStoreError);
    expect(calls).toHaveLength(2);
  });
});

describe("toStoreError classification", () => {
  const cls = (code: string | undefined, status: number | undefined, message = "x") => {
    const e = toStoreError({ message, code }, status);
    return e.network ? "network" : e.permanent ? "permanent" : "retry";
  };
  it("network failures and 5xx retry", () => {
    expect(cls("", 0, "TypeError: Failed to fetch")).toBe("network");
    expect(cls(undefined, undefined, "Load failed")).toBe("network");
    expect(cls("XX000", 500)).toBe("retry");
    expect(cls("PGRST000", 503)).toBe("retry");
    expect(cls("08006", 503)).toBe("retry");
  });
  it("auth, timeouts and rate limits retry", () => {
    expect(cls("PGRST301", 401)).toBe("retry");
    expect(cls("42501", 403)).toBe("retry");
    expect(cls("", 408)).toBe("retry");
    expect(cls("", 429)).toBe("retry");
    expect(cls("57014", 500)).toBe("retry");
    expect(toStoreError({ message: "t", code: "57014" }, 500).code).toBe("57014");
  });
  it("data, constraint and schema errors, and other 4xx, are permanent", () => {
    expect(cls("22P02", 400)).toBe("permanent");
    expect(cls("23505", 409)).toBe("permanent");
    expect(cls("42883", 404)).toBe("permanent");
    expect(cls("PGRST202", 404)).toBe("permanent");
    expect(cls("", 413)).toBe("permanent");
  });
});
