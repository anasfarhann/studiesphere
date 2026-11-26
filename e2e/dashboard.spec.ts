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
  const card = page.getByRole("link", { name: /A very long folder name/ }).last();
  const box = await card.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(834);
  const title = card.locator("span.truncate", { hasText: "A very long folder name" }).first();
  expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await noOverflow(page)).toBe(true);
});

test("New page button in the header is at least 44 px and fits on a small phone", async ({ page }) => {
  for (const w of [320, 1280]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto("/dev/dashboard");
    const b = await page.getByRole("main").getByRole("button", { name: "New page" }).boundingBox();
    expect(b!.width).toBeGreaterThanOrEqual(44);
    expect(b!.height).toBeGreaterThanOrEqual(44);
    expect(b!.x + b!.width).toBeLessThanOrEqual(w);
    expect(await noOverflow(page)).toBe(true);
  }
});

test("Your folders: cards show page counts, no notebook wording, no overflow", async ({ page }) => {
  for (const w of [320, 390, 834, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto("/dev/dashboard");
    await expect(page.getByRole("heading", { name: "Your folders" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New folder" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Biology.*12 pages|12 pages.*Biology/ })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/notebook|subject/i);
    expect(await noOverflow(page)).toBe(true);
  }
});

async function expectMenuInsideViewport(page: import("@playwright/test").Page, triggerName: RegExp | string, width: number, height: number) {
  const trigger = page.getByRole("button", { name: triggerName });
  await trigger.scrollIntoViewIfNeeded();
  const tb = await trigger.boundingBox();
  expect(tb!.width).toBeGreaterThanOrEqual(44);
  expect(tb!.height).toBeGreaterThanOrEqual(44);
  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const mb = await menu.boundingBox();
  expect(mb!.x).toBeGreaterThanOrEqual(0);
  expect(mb!.y).toBeGreaterThanOrEqual(0);
  expect(mb!.x + mb!.width).toBeLessThanOrEqual(width);
  expect(mb!.y + mb!.height).toBeLessThanOrEqual(height);
  const items = page.getByRole("menuitem");
  await expect(items).toHaveCount(6);
  for (let i = 0; i < 6; i++) expect((await items.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await noOverflow(page)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

for (const [w, h] of [[320, 700], [390, 844]]) {
  test(`dashboard page menu sits at the card's bottom-right and opens inside the viewport at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/dev/dashboard");
    const card = page.getByRole("link", { name: /Cell walls and membranes/ }).locator("..");
    const cb = await card.boundingBox();
    const tb = await page.getByRole("button", { name: "Actions for Cell walls and membranes" }).boundingBox();
    expect(tb!.x + tb!.width).toBeGreaterThan(cb!.x + cb!.width - 24);
    expect(tb!.y + tb!.height).toBeGreaterThan(cb!.y + cb!.height - 24);
    await expectMenuInsideViewport(page, "Actions for Cell walls and membranes", w, h);
  });
}

test("Rename opened from a card is a viewport-covering dialog at 390", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/dashboard");
  await page.getByRole("button", { name: "Actions for Cell walls and membranes" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const dlg = page.getByRole("dialog", { name: "Rename page" });
  await expect(dlg).toBeVisible();
  const db = await dlg.boundingBox();
  expect(db!.x).toBeGreaterThanOrEqual(0);
  expect(db!.x + db!.width).toBeLessThanOrEqual(390);
  expect(db!.y).toBeGreaterThanOrEqual(0);
  expect(db!.y + db!.height).toBeLessThanOrEqual(844);
  const overlay = await dlg.locator("..").boundingBox();
  expect(overlay).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
});

for (const [w, h] of [[320, 700], [390, 844]]) {
  test(`folder view page menu stays inside the viewport at ${w}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/dev/folder");
    await expectMenuInsideViewport(page, /Actions for Cell walls/, w, h);
    // A tile near the bottom of the screen flips the popover upward.
    await page.setViewportSize({ width: w, height: 620 });
    await expectMenuInsideViewport(page, /Actions for Mitosis/, w, 620);
  });
}
