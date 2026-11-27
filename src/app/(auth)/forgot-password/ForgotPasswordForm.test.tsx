import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/en";

const resetPasswordForEmail = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createBrowserClient: () => ({ auth: { resetPasswordForEmail } }),
}));

import { ForgotPasswordForm } from "./ForgotPasswordForm";

async function submit(email = "a@b.co") {
  render(<ForgotPasswordForm />);
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.click(screen.getByRole("button", { name: en.sendResetLink }));
}

afterEach(cleanup);

describe("ForgotPasswordForm", () => {
  beforeEach(() => resetPasswordForEmail.mockReset());

  it("asks Supabase for a reset link that returns to /reset-password", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await submit("me@school.edu");
    expect(resetPasswordForEmail).toHaveBeenCalledWith("me@school.edu", {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    expect(await screen.findByRole("status")).toHaveTextContent(en.resetLinkSent);
  });

  it("shows the same neutral message when the account does not exist", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: { code: "user_not_found", status: 400, message: "x" } });
    await submit();
    expect(await screen.findByRole("status")).toHaveTextContent(en.resetLinkSent);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an error for rate limits", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: { code: "over_email_send_rate_limit", status: 429, message: "x" } });
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(en.rateLimited);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows an error when the network fails", async () => {
    // supabase-js reports fetch failures as an AuthRetryableFetchError result rather than throwing.
    resetPasswordForEmail.mockResolvedValue({ data: null, error: { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" } });
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(en.networkError);
  });

  it("links back to sign in", () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByRole("link", { name: en.signIn })).toHaveAttribute("href", "/login");
  });
});
