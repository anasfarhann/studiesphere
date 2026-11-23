import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test("create subject, notebook and page, landing on the page route", async ({ page }) => {
  test.skip(!email || !password, "needs E2E_USER_EMAIL and E2E_USER_PASSWORD (confirmed user)");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);

  const subject = `Biology ${Date.now()}`;
  await page.getByRole("button", { name: "New subject" }).click();
  await page.getByLabel("Subject name").fill(subject);
  await page.getByRole("radio", { name: "Green" }).check({ force: true });
  await page.getByRole("button", { name: "Create subject" }).click();
  await expect(page).toHaveURL(/\/app\/s\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();

  await page.getByLabel("Notebook title").fill("Cells");
  await page.getByRole("button", { name: "Create notebook" }).click();
  await expect(page).toHaveURL(/\/app\/n\/[0-9a-f-]+$/);

  await page.getByRole("button", { name: "New page" }).click();
  await expect(page).toHaveURL(/\/app\/p\/[0-9a-f-]+$/);
  await expect(page.getByText("Canvas coming soon")).toBeVisible();
});
