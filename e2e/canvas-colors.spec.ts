import { expect, test } from "@playwright/test";

type EditorHook = { __editor?: { scene: { all(): Array<{ color?: string }> } } };

test.use({ viewport: { width: 390, height: 844 } });

test("a custom colour from the wheel becomes a preset and draws", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  const pen = page.getByRole("button", { name: "Pen", exact: true });
  await pen.click(); // pen is already active -> opens its options
  const opts = page.getByRole("group", { name: "Pen options" });
  await expect(opts).toBeVisible();
  await opts.getByRole("button", { name: "Colour #1B1A1F" }).click();
  await expect(opts.getByRole("slider", { name: "Hue" })).toBeVisible();
  await opts.getByRole("textbox", { name: "Hex" }).fill("#00aa55");
  await opts.getByRole("button", { name: "Add to presets" }).click();
  const swatch = opts.getByRole("button", { name: "Colour #00aa55" });
  await expect(swatch).toBeVisible();
  const vp = page.viewportSize()!;
  const box = (await opts.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  const sw = (await swatch.boundingBox())!;
  expect(Math.min(sw.width, sw.height)).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await expect(opts).toBeHidden();
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(canvas.x + 100, canvas.y + 300);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 250, canvas.y + 350, { steps: 8 });
  await page.mouse.up();
  const colors = await page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all().map((e) => e.color));
  expect(colors).toEqual(["#00aa55"]);
});

test("with 12 pen presets and the wheel open, the options popover stays on screen and scrolls to Add", async ({ page }) => {
  const extra = Array.from({ length: 9 }, (_, i) => `#10${(0x20 + i * 16).toString(16).padStart(2, "0")}aa`);
  await page.addInitScript((presets) => {
    localStorage.setItem("ss.tools.v1", JSON.stringify({ pen: { presets: ["#1B1A1F", "#2563EB", "#DC2626", ...presets] } }));
  }, extra);
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  const opts = page.getByRole("group", { name: "Pen options" });
  await expect(opts.getByRole("button", { name: /^Colour #/ })).toHaveCount(12);
  await opts.getByRole("button", { name: "Colour #1B1A1F" }).click();
  await expect(opts.getByRole("slider", { name: "Hue" })).toBeVisible();
  const box = (await opts.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  // Capped from its measured top (not a fixed guess): it ends 12 px above the viewport bottom at most.
  const cap = await opts.evaluate((el) => ({ top: el.getBoundingClientRect().top, max: parseFloat(getComputedStyle(el).maxHeight) }));
  expect(Math.abs(cap.top + cap.max - (844 - 12))).toBeLessThanOrEqual(1);
  const add = opts.getByRole("button", { name: "Add to presets" });
  await add.scrollIntoViewIfNeeded();
  const a = (await add.boundingBox())!;
  expect(a.y).toBeGreaterThanOrEqual(box.y);
  expect(a.y + a.height).toBeLessThanOrEqual(Math.min(844, box.y + box.height) + 0.5);
  await opts.getByRole("textbox", { name: "Hex" }).fill("#00aa55");
  await add.click();
  await expect(opts.getByTestId("preset-message")).toHaveText("Presets are full");
});
