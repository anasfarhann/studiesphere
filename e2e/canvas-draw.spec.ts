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
