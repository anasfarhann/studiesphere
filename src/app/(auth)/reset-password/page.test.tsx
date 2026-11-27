import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/en";
import { RECOVERY_COOKIE, signRecoveryCookie } from "@/lib/recovery-cookie";

const state: { claims: Record<string, unknown> | null; cookie?: string } = { claims: null };
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth: { getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null }) } }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === RECOVERY_COOKIE && state.cookie ? { value: state.cookie } : undefined) }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ clearRecoveryCookie: vi.fn() }));

import ResetPasswordPage from "./page";

async function renderPage() {
  render(await ResetPasswordPage());
}
const expired = () => screen.queryByRole("heading", { name: en.resetExpiredTitle });
const form = () => screen.queryByRole("heading", { name: en.resetTitle });

afterEach(cleanup);

describe("/reset-password", () => {
  beforeEach(() => {
    vi.stubEnv("RECOVERY_COOKIE_SECRET", "s3cret");
    state.claims = null;
    state.cookie = undefined;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("shows the expired state without a session", async () => {
    state.cookie = signRecoveryCookie("user-1", Date.now(), "s3cret");
    await renderPage();
    expect(expired()).not.toBeNull();
    expect(form()).toBeNull();
  });

  it("shows the expired state to a signed-in user without a recovery cookie", async () => {
    state.claims = { sub: "user-1", amr: [{ method: "password", timestamp: Date.now() / 1000 }] };
    await renderPage();
    expect(expired()).not.toBeNull();
    expect(form()).toBeNull();
  });

  it("shows the expired state for a tampered cookie", async () => {
    state.claims = { sub: "user-1" };
    const [, exp, mac] = signRecoveryCookie("user-2", Date.now(), "s3cret").split(".");
    state.cookie = `user-1.${exp}.${mac}`;
    await renderPage();
    expect(expired()).not.toBeNull();
  });

  it("shows the expired state for an expired cookie", async () => {
    state.claims = { sub: "user-1" };
    state.cookie = signRecoveryCookie("user-1", Date.now() - 16 * 60_000, "s3cret");
    await renderPage();
    expect(expired()).not.toBeNull();
  });

  it("shows the expired state for another user's cookie", async () => {
    state.claims = { sub: "user-1" };
    state.cookie = signRecoveryCookie("user-2", Date.now(), "s3cret");
    await renderPage();
    expect(expired()).not.toBeNull();
  });

  it("shows the form for a valid cookie matching the session", async () => {
    state.claims = { sub: "user-1" };
    state.cookie = signRecoveryCookie("user-1", Date.now(), "s3cret");
    await renderPage();
    expect(form()).not.toBeNull();
    expect(expired()).toBeNull();
  });

  it("shows the form for a fresh recovery session (amr)", async () => {
    const now = Math.floor(Date.now() / 1000);
    state.claims = { sub: "user-1", iat: now, amr: [{ method: "recovery", timestamp: now }] };
    await renderPage();
    expect(form()).not.toBeNull();
  });
});
