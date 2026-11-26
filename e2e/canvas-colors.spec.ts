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

test("Save preset replaces the selected preset and survives a reload", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  const opts = page.getByRole("group", { name: "Pen options" });
  await opts.getByRole("button", { name: "Colour #2563EB" }).click();
  await opts.getByRole("button", { name: "Colour #2563EB" }).click(); // selected -> opens the wheel
  await opts.getByRole("textbox", { name: "Hex" }).fill("#00aa55");
  await opts.getByRole("button", { name: "Save preset" }).click();
  await expect(opts.getByRole("button", { name: "Colour #00aa55" })).toHaveAttribute("aria-pressed", "true");
  await expect(opts.getByRole("button", { name: "Colour #2563EB" })).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await expect(page.getByRole("group", { name: "Pen options" }).getByRole("button", { name: "Colour #00aa55" })).toBeVisible();
  await page.getByRole("group", { name: "Pen options" }).getByRole("button", { name: "Reset colours" }).click();
  await expect(page.getByRole("group", { name: "Pen options" }).getByRole("button", { name: "Colour #2563EB" })).toBeVisible();
});

test("the eyedropper picks a stroke's colour from the page, then draws with it", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  const pen = page.getByRole("button", { name: "Pen", exact: true });
  await pen.click();
  const opts = page.getByRole("group", { name: "Pen options" });
  await opts.getByRole("button", { name: "Colour #DC2626" }).click();
  await page.keyboard.press("Escape");
  await page.mouse.move(canvas.x + 100, canvas.y + 300);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 250, canvas.y + 300, { steps: 6 });
  await page.mouse.up();
  await pen.click();
  await opts.getByRole("button", { name: "Colour #DC2626" }).click(); // keep the options open on a different colour
  await opts.getByRole("button", { name: "Colour #1B1A1F" }).click();
  await opts.getByRole("button", { name: "Pick a colour from the page" }).click();
  await expect(page.getByTestId("eyedropper-hint")).toContainText("Tap a colour on the page");
  await expect(opts).toBeHidden();
  await page.mouse.click(canvas.x + 170, canvas.y + 300);
  await expect(page.getByTestId("eyedropper-hint")).toHaveCount(0);
  const state = await page.evaluate(() => {
    const e = (window as unknown as { __editor: { settings: { pen: { color: string } }; scene: { all(): unknown[] } } }).__editor;
    return { color: e.settings.pen.color, count: e.scene.all().length };
  });
  expect(state).toEqual({ color: "#DC2626", count: 1 });
  // Escape cancels an armed pick without changing anything.
  await pen.click();
  await opts.getByRole("button", { name: "Pick a colour from the page" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("eyedropper-hint")).toHaveCount(0);
});

test.describe("at 320 x 640", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("with 12 pen presets and the wheel open, swatches, Save, Add, Reset and the dropper fit and are 44 px", async ({ page }) => {
    const extra = Array.from({ length: 9 }, (_, i) => `#10${(0x20 + i * 16).toString(16).padStart(2, "0")}aa`);
    await page.addInitScript((presets) => {
      localStorage.setItem("ss.tools.v1", JSON.stringify({ pen: { presets: ["#1B1A1F", "#2563EB", "#DC2626", ...presets] } }));
    }, extra);
    await page.goto("/dev/canvas");
    await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
    await page.getByRole("button", { name: "Pen", exact: true }).click();
    const opts = page.getByRole("group", { name: "Pen options" });
    const swatches = opts.getByRole("button", { name: /^Colour #/ });
    await expect(swatches).toHaveCount(12);
    await opts.getByRole("button", { name: "Colour #1B1A1F" }).click(); // selected -> opens the wheel (and anchors Save)
    await expect(opts.getByRole("slider", { name: "Hue" })).toBeVisible();
    const targets = [
      ...(await swatches.all()),
      opts.getByRole("button", { name: "Save preset" }),
      opts.getByRole("button", { name: "Add to presets" }),
      opts.getByRole("button", { name: "Reset colours" }),
      opts.getByRole("button", { name: "Pick a colour from the page" }),
    ];
    for (const el of targets) {
      await el.scrollIntoViewIfNeeded();
      const b = (await el.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(320);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(640);
      expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
    }
    // Nothing scrolls the page sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
