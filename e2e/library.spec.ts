import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

test("create a folder and a page in it, then back to the folder, rename and delete rules", async ({ page }) => {
  test.skip(!email || !password, "needs E2E_USER_EMAIL and E2E_USER_PASSWORD (confirmed user)");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);

  const folder = `Biology ${Date.now()}`;
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Folder name").fill(folder);
  await page.getByRole("radio", { name: "Mint" }).check({ force: true });
  await page.getByRole("button", { name: "Create folder" }).click();
  await expect(page).toHaveURL(/\/app\/s\/[0-9a-f-]+$/);
  const folderUrl = page.url();
  await expect(page.getByRole("heading", { name: folder })).toBeVisible();
  await expect(page.getByText("No pages in this folder yet.")).toBeVisible();

  // An empty folder can be renamed.
  const renamed = `${folder} renamed`;
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Folder name").fill(renamed);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name: renamed })).toBeVisible();

  await page.getByRole("main").getByRole("button", { name: "New page" }).click();
  await expect(page).toHaveURL(/\/app\/p\/[0-9a-f-]+$/);
  await expect(page.getByTestId("canvas")).toBeVisible();
  await page.getByRole("link", { name: `Back to ${renamed}` }).click();
  await expect(page).toHaveURL(folderUrl);
  await expect(page.getByText("1 page", { exact: true })).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/notebook/i);

  // A folder with pages cannot be deleted.
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toContainText("This folder still has pages.");
  await expect(page.getByRole("button", { name: "Delete folder" })).toHaveCount(0);
});
