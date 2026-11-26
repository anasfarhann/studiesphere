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

type PEl = { id: string; type: string; w: number; h: number; crop?: { x: number; y: number; w: number; h: number } };
type SceneHook = { __editor?: { scene: { all(): PEl[]; update(id: string, patch: Partial<PEl>): void } } };

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 834, height: 1112 },
]) {
  test(`${viewport.width}x${viewport.height}: the photo preview keeps its aspect, cropped and whole`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dev/canvas");
    await page.waitForFunction(() => (window as unknown as SceneHook).__editor !== undefined);
    const dataUrl = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 200;
      c.height = 300;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#2563eb";
      ctx.fillRect(0, 0, 200, 300);
      return c.toDataURL("image/png");
    });
    await page.getByTestId("photo-input").setInputFiles({ name: "tall.png", mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1], "base64") });
    await page.waitForFunction(() => (window as unknown as SceneHook).__editor!.scene.all().some((e) => e.type === "image"));
    const crop = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    const card = await page.evaluate((c) => {
      const ed = (window as unknown as SceneHook).__editor!;
      const el = ed.scene.all().find((e) => e.type === "image")!;
      ed.scene.update(el.id, { crop: c });
      return { w: el.w, h: el.h };
    }, crop);
    await page.getByRole("button", { name: "Preview" }).click();
    const dialog = page.getByRole("dialog", { name: "Photo preview" });
    const frame = dialog.getByTestId("image-preview-frame");
    await expect(frame.getByRole("img")).toBeVisible();
    const ratio = async () => {
      const b = (await frame.boundingBox())!;
      return b.width / b.height;
    };
    const cardAspect = card.w / card.h;
    expect(Math.abs((await ratio()) / cardAspect - 1)).toBeLessThan(0.01);
    await dialog.getByRole("button", { name: "Show whole photo" }).click();
    const whole = cardAspect * (crop.h / crop.w);
    await expect.poll(async () => Math.abs((await ratio()) / whole - 1)).toBeLessThan(0.01);
    // The whole dialog still fits the viewport.
    const box = (await dialog.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  });
}
