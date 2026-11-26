import { expect, test } from "@playwright/test";

type Hooks = { __editor?: unknown; __devPreview?: { type: string; bytes: number; width: number; height: number } };

test("drawing makes a JPEG card preview, at most 480 px wide, a moment later and never mid-stroke", async ({ page }) => {
  await page.goto("/dev/canvas");
  const canvas = page.getByTestId("canvas");
  await page.waitForFunction(() => (window as unknown as Hooks).__editor !== undefined);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no box");
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 180, { steps: 20 });
  await page.mouse.up();
  expect(await page.evaluate(() => (window as unknown as Hooks).__devPreview)).toBeUndefined();
  await page.waitForFunction(() => (window as unknown as Hooks).__devPreview !== undefined, null, { timeout: 8000 });
  const p = await page.evaluate(() => (window as unknown as Hooks).__devPreview!);
  expect(p.type).toBe("image/jpeg");
  expect(p.bytes).toBeGreaterThan(500);
  expect(p.width).toBe(480);
  expect(p.height).toBeGreaterThanOrEqual(360);
});

for (const path of ["/dev/dashboard", "/dev/folder"]) {
  test(`${path}: a page with a preview shows it, covering its card`, async ({ page }) => {
    await page.goto(path);
    const img = page.locator('a[href="/app/p/p2"] img, a[href="/app/p/p1"] img').first();
    await expect(img).toBeVisible();
    const fit = await img.evaluate((el) => getComputedStyle(el).objectFit);
    expect(fit).toBe("cover");
    const [ib, pb] = await img.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const q = el.parentElement!.getBoundingClientRect();
      return [
        [r.width, r.height],
        [q.width, q.height],
      ];
    });
    expect(ib).toEqual(pb);
  });
}
