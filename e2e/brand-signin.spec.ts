import { expect, test } from "@playwright/test";

test("the new logo renders on /", async ({ page }) => {
  await page.goto("/");
  const brand = page.getByRole("region", { name: "About Studiesphere" }).filter({ visible: true }).first();
  await expect(brand.getByText("studiesphere", { exact: true })).toBeVisible();
  const mark = brand.locator('svg[viewBox="0 0 100 100"]').first();
  await expect(mark).toBeVisible();
  await expect(mark.locator('path[d="M50 10 A20 20 0 0 0 50 50 A20 20 0 0 1 50 90"]')).toHaveCount(1);
  const stroke = await mark.locator("circle").getAttribute("stroke");
  const id = stroke!.match(/^url\(#(.+)\)$/)![1];
  await expect(mark.locator(`linearGradient[id="${id}"]`)).toHaveCount(1);
  // The old wave-globe logo is gone.
  await expect(page.locator('path[d^="M4.5 9.5c5 2 10 2 15 0"]')).toHaveCount(0);
});

test("favicon is served", async ({ request }) => {
  const res = await request.get("/favicon.ico", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
});

test("show/hide toggles the password field type", async ({ page }) => {
  await page.goto("/login");
  const field = page.getByLabel("Password", { exact: true });
  await field.fill("secret-pass-1");
  await expect(field).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(field).toHaveAttribute("type", "text");
  const toggle = page.getByRole("button", { name: "Show password" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(field).toHaveAttribute("type", "password");
  await expect(field).toHaveValue("secret-pass-1");
});

test("focused field shows the ink border and lavender ring", async ({ page }) => {
  await page.goto("/login");
  const email = page.getByLabel("Email");
  await email.focus();
  const shell = email.locator("..");
  await expect(shell).toHaveCSS("border-top-color", "rgb(27, 26, 31)");
  await expect(shell).toHaveCSS("border-top-width", "2px");
  await expect(shell).toHaveCSS("box-shadow", /rgb\(220, 214, 250\) 0px 0px 0px 4px/);
  // Resting fields: 1.5px border on the warm field fill.
  const pw = page.getByLabel("Password", { exact: true }).locator("..");
  // 1.5px; Chrome snaps it to whole device pixels (1px at DPR 1, 1.5px on Retina).
  await expect(pw).toHaveCSS("border-top-width", /^1(\.5)?px$/);
  await expect(pw).toHaveCSS("background-color", "rgb(252, 250, 248)");
});

test("sign-up mode uses its own wording", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your account", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await expect(page.getByText("Already have an account?")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveCount(0);
});

test("forgot password sends a reset link and shows the neutral message", async ({ page }) => {
  let body: { email?: string } | null = null;
  let redirectTo: string | null = null;
  // Supabase is stubbed: the browser client posts to <SUPABASE_URL>/auth/v1/recover.
  await page.route("**/auth/v1/recover**", async (route) => {
    body = route.request().postDataJSON();
    redirectTo = new URL(route.request().url()).searchParams.get("redirect_to");
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: "Reset your password", level: 1 })).toBeVisible();
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toHaveText("If an account exists for that email, we've sent a reset link.");
  expect(body).toMatchObject({ email: "someone@example.com" });
  expect(redirectTo).toMatch(/^http:\/\/localhost:3100\/auth\/recovery$/);
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
});

test("forgot password reports rate limits", async ({ page }) => {
  await page.route("**/auth/v1/recover**", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" }),
    }),
  );
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Too many attempts" })).toHaveText(
    "Too many attempts. Please wait a few minutes and try again.",
  );
});

test("/reset-password without a session shows the expired state", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole("heading", { name: "This link has expired", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password");
  await expect(page.getByLabel("New password")).toHaveCount(0);
});

test("auth callback rejects off-site next targets", async ({ request }) => {
  const res = await request.get("/auth/callback?next=//evil.example", { maxRedirects: 0 });
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.status()).toBeLessThan(400);
  expect(new URL(res.headers()["location"]).host).toBe("localhost:3100");
});

test("auth confirm refuses unknown link types and sends a tokenless recovery link to the expired state", async ({ request, page }) => {
  const bad = await request.get("/auth/confirm?token_hash=x&type=magiclink&next=/app", { maxRedirects: 0 });
  expect(new URL(bad.headers()["location"]).pathname).toBe("/login");
  await page.goto("/auth/confirm?type=recovery&next=//evil.example");
  await expect(page).toHaveURL(/localhost:3100\/reset-password$/);
  await expect(page.getByRole("heading", { name: "This link has expired", level: 1 })).toBeVisible();
});
