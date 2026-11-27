import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

function randomEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

test("signing up with email and password lands on /app", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(randomEmail());
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery-9");
  await page.getByRole("button", { name: "Create account" }).click();
  // Email confirmation is ON in production: either a session (/app) or the confirm notice.
  await expect(
    page.getByText("Check your email to confirm your account").or(page.getByRole("heading", { name: "Your folders" })),
  ).toBeVisible({ timeout: 15_000 });
});

test("visiting /app signed out redirects to /login", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong password shows 'Email or password is incorrect'", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(randomEmail());
  await page.getByLabel("Password", { exact: true }).fill("not-the-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect")).toBeVisible();
});

test("sign out returns to /", async ({ page }) => {
  test.skip(!email || !password, "needs E2E_USER_EMAIL and E2E_USER_PASSWORD (confirmed user)");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
});
