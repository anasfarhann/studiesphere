import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/en";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { RecoveryLanding } from "./RecoveryLanding";

const fetchMock = vi.fn();

function land(hash: string) {
  window.history.replaceState(null, "", `/auth/recovery${hash}`);
  render(
    <StrictMode>
      <RecoveryLanding />
    </StrictMode>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RecoveryLanding", () => {
  beforeEach(() => {
    replace.mockReset();
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows a checking state", () => {
    land("");
    expect(screen.getByText(en.checkingLink)).toBeInTheDocument();
  });

  it("sends an error fragment to the expired state without posting", async () => {
    land("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/reset-password"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("sends a missing fragment or non-recovery type to the expired state", async () => {
    land("#access_token=at&refresh_token=rt&type=magiclink");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/reset-password"));
    expect(fetchMock).not.toHaveBeenCalled();
    cleanup();
    replace.mockReset();
    land("");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/reset-password"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("strips the hash, posts the tokens once, then goes to the reset form", async () => {
    land("#access_token=at&refresh_token=rt&expires_in=3600&token_type=bearer&type=recovery");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/auth/recovery");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/reset-password"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/auth/recovery/session");
    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    expect(JSON.parse(init.body)).toEqual({ access_token: "at", refresh_token: "rt" });
  });

  it("gives up after 15 s so a hung request still ends on /reset-password", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) =>
          init.signal?.addEventListener("abort", () => reject(new DOMException("timed out", "TimeoutError"))),
        ),
    );
    land("#access_token=at&refresh_token=rt&type=recovery");
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    await new Promise((r) => setTimeout(r, 10));
    expect(replace).not.toHaveBeenCalled();
    controller.abort();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/reset-password"));
    timeout.mockRestore();
  });

  it("offers a way forward without JavaScript (server markup)", () => {
    // React leaves <noscript> empty on the client; what matters is the server-rendered HTML.
    const html = renderToStaticMarkup(<RecoveryLanding />);
    const noscript = html.match(/<noscript>([\s\S]*)<\/noscript>/)?.[1] ?? "";
    expect(noscript).toContain('href="/forgot-password"');
    expect(noscript).toContain(en.noscriptRecovery);
  });

  it("still ends on /reset-password (expired state) when the server refuses or the network fails", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    land("#access_token=at&refresh_token=rt&type=recovery");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/reset-password"));
    cleanup();
    replace.mockReset();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    land("#access_token=at&refresh_token=rt&type=recovery");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/reset-password"));
  });
});
