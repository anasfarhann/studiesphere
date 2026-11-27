import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/en";

const updateUser = vi.fn();
const signOut = vi.fn();
const clearRecoveryCookie = vi.fn();
const calls: string[] = [];
const push = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createBrowserClient: () => ({ auth: { updateUser, signOut } }) }));
vi.mock("./actions", () => ({ clearRecoveryCookie: () => clearRecoveryCookie() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { ResetPasswordForm } from "./ResetPasswordForm";

async function fill(pw: string, confirm: string) {
  render(<ResetPasswordForm />);
  await userEvent.type(screen.getByLabelText(en.newPassword, { selector: "input" }), pw);
  await userEvent.type(screen.getByLabelText(en.confirmPassword, { selector: "input" }), confirm);
  await userEvent.click(screen.getByRole("button", { name: en.updatePassword }));
}

afterEach(cleanup);

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    calls.length = 0;
    updateUser.mockReset();
    signOut.mockReset().mockImplementation(async () => {
      calls.push("signOut");
      return { error: null };
    });
    clearRecoveryCookie.mockReset().mockImplementation(async () => {
      calls.push("clear");
    });
    push.mockReset().mockImplementation(() => calls.push("push"));
    refresh.mockReset();
  });

  it("requires at least 8 characters like sign-up", () => {
    render(<ResetPasswordForm />);
    expect(screen.getByLabelText(en.newPassword, { selector: "input" })).toHaveAttribute("minlength", "8");
    expect(screen.getByLabelText(en.confirmPassword, { selector: "input" })).toHaveAttribute("minlength", "8");
  });

  it("refuses mismatched passwords without calling Supabase", async () => {
    await fill("correct-horse-1", "correct-horse-2");
    expect(await screen.findByRole("alert")).toHaveTextContent(en.passwordsDontMatch);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("updates the password, signs out other devices, ends recovery and goes to /app with a notice", async () => {
    updateUser.mockResolvedValue({ data: {}, error: null });
    await fill("correct-horse-1", "correct-horse-1");
    expect(updateUser).toHaveBeenCalledWith({ password: "correct-horse-1" });
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(push).toHaveBeenCalledWith("/app?notice=password-updated");
    expect(calls).toEqual(["signOut", "clear", "push"]);
  });

  it("still finishes when signing out other devices fails", async () => {
    updateUser.mockResolvedValue({ data: {}, error: null });
    signOut.mockResolvedValue({ error: { message: "x" } });
    await fill("correct-horse-1", "correct-horse-1");
    expect(clearRecoveryCookie).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/app?notice=password-updated");
  });

  it("uses helpful placeholders", () => {
    render(<ResetPasswordForm />);
    expect(screen.getByLabelText(en.newPassword, { selector: "input" })).toHaveAttribute("placeholder", en.newPasswordPlaceholder);
    expect(screen.getByLabelText(en.confirmPassword, { selector: "input" })).toHaveAttribute("placeholder", en.confirmPasswordPlaceholder);
  });

  it("shows a friendly error from Supabase", async () => {
    updateUser.mockResolvedValue({ data: null, error: { code: "same_password", message: "x" } });
    await fill("correct-horse-1", "correct-horse-1");
    expect(await screen.findByRole("alert")).toHaveTextContent(en.samePassword);
    expect(push).not.toHaveBeenCalled();
    expect(clearRecoveryCookie).not.toHaveBeenCalled();
  });
});
