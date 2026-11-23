import { expect, test } from "@playwright/test";

type EditorHook = { __editor?: { scene: { all(): unknown[] } } };

test("dragging the mouse across the canvas draws one stroke", async ({ page }) => {
  await page.goto("/dev/canvas");
  const canvas = page.getByTestId("canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("button", { name: "Pen", exact: true })).toBeVisible();
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no box");
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 150, { steps: 10 });
  await page.mouse.move(box.x + 300, box.y + 120, { steps: 10 });
  await page.mouse.up();
  const count = await page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all().length);
  expect(count).toBe(1);
});

test("a stroke is autosaved within 2 s", async ({ page }) => {
  await page.goto("/dev/canvas");
  const canvas = page.getByTestId("canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  const status = page.getByTestId("save-status");
  await expect(status).toHaveText("Saved");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no box");
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 150, { steps: 10 });
  await page.mouse.up();
  await expect(status).toHaveText("Saving…");
  await expect(status).toHaveText("Saved", { timeout: 2000 });
});

test("toolbar buttons opt out of double-tap zoom (touch-action: manipulation)", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  const toolbar = page.getByRole("toolbar", { name: "Drawing tools" });
  expect(await toolbar.evaluate((el) => getComputedStyle(el).touchAction)).toBe("manipulation");
  const undo = page.getByRole("button", { name: "Undo" });
  expect(await undo.evaluate((el) => getComputedStyle(el).touchAction)).toBe("manipulation");
});

test("strokes can start in the gap between top-bar pills and just below the toolbar row", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  const bar = await page.getByRole("toolbar", { name: "Drawing tools" }).boundingBox();
  if (!bar) throw new Error("toolbar has no box");
  const count = () => page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all().length);
  const draw = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y + 60, { steps: 8 });
    await page.mouse.up();
  };
  // Top row, centred: empty space between the title slot and the undo/redo cluster.
  await draw(bar.x + bar.width / 2, Math.max(8, bar.y - 30));
  expect(await count()).toBe(1);
  // Just below the toolbar pill.
  await draw(bar.x + bar.width / 2, bar.y + bar.height + 6);
  expect(await count()).toBe(2);
});

test("at iPad portrait and phone widths the bar never overflows the page", async ({ page }) => {
  for (const [w, h] of [[834, 1194], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/dev/canvas");
    await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(page.getByTestId("save-status")).toBeVisible();
  }
});
