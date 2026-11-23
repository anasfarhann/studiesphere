import { expect, test } from "@playwright/test";

const noOverflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test("iPad portrait: panel drops below main, no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto("/dev/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Hi, Anas!" })).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  const main = await page.getByRole("main").boundingBox();
  const panel = await page.getByRole("complementary", { name: "Today" }).boundingBox();
  expect(panel!.y).toBeGreaterThanOrEqual(main!.y + main!.height - 1);
});

test("laptop: right panel sits beside the main column", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/dev/dashboard");
  await expect(page.getByRole("heading", { name: "Today's classes" })).toBeVisible();
  const main = await page.getByRole("main").boundingBox();
  const panel = await page.getByRole("complementary", { name: "Today" }).boundingBox();
  expect(panel!.x).toBeGreaterThanOrEqual(main!.x + main!.width - 1);
  expect(Math.abs(panel!.y - main!.y)).toBeLessThan(40);
  expect(panel!.width).toBeLessThanOrEqual(361);
  expect(await noOverflow(page)).toBe(true);
});

test("phone: stacked, bottom bar, no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/dashboard");
  await expect(page.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  const main = await page.getByRole("main").boundingBox();
  const panel = await page.getByRole("complementary", { name: "Today" }).boundingBox();
  expect(panel!.y).toBeGreaterThanOrEqual(main!.y + main!.height - 1);
  expect(await noOverflow(page)).toBe(true);
});

test("long names truncate and keep cards inside their column", async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto("/dev/dashboard");
  const card = page.getByRole("link", { name: /A very long subject name/ }).last();
  const box = await card.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(834);
  const title = card.locator("span.truncate", { hasText: "A very long subject name" }).first();
  expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await noOverflow(page)).toBe(true);
});
