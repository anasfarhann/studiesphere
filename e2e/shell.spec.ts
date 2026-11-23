import { expect, test } from "@playwright/test";

test("phone width shows the bottom bar with reachable nav", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/shell");
  const nav = page.getByRole("navigation", { name: "Main" });
  const box = await nav.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThan(844 - 2);
  expect(box!.width).toBeGreaterThan(380);
  await expect(page.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Subjects", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("laptop width shows the left rail", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/dev/shell");
  const box = await page.getByRole("navigation", { name: "Main" }).boundingBox();
  expect(box!.x).toBeLessThan(40);
  expect(box!.width).toBeLessThan(120);
  expect(box!.height).toBeGreaterThan(600);
  await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Timetable (coming soon)" })).toBeDisabled();
});

test("font is DM Sans", async ({ page }) => {
  await page.goto("/dev/shell");
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("DM Sans");
});
