import { expect, test } from "@playwright/test";

test("landing page shows app name and sign-in link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Studiesphere" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
});
