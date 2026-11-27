import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({ auth: {} })) }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { createImplicitFlowClient } from "./client";

describe("createImplicitFlowClient", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    createClient.mockClear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });

  // @supabase/ssr's createBrowserClient forces flowType "pkce" (and returns its singleton), so the
  // implicit client must come from supabase-js directly.
  it("builds a throwaway supabase-js client in implicit flow that keeps no session", () => {
    createImplicitFlowClient();
    expect(createClient).toHaveBeenCalledWith(
      "https://x.supabase.co",
      "anon",
      expect.objectContaining({
        auth: expect.objectContaining({
          flowType: "implicit",
          persistSession: false,
          detectSessionInUrl: false,
          autoRefreshToken: false,
        }),
      }),
    );
  });
});
