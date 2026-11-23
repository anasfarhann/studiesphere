import { expect, test } from "@playwright/test";

type EditorHook = { __editor?: { scene: { all(): { type: string; w?: number; h?: number }[] } } };

// 2x1 opaque PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8Dwn+E/A8N/AA//Af8cEj0wAAAAAElFTkSuQmCC",
  "base64",
);

test("inserting a photo adds an image element", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  await page.getByTestId("photo-input").setInputFiles({ name: "tiny.png", mimeType: "image/png", buffer: PNG });
  await page.waitForFunction(() =>
    (window as unknown as EditorHook).__editor!.scene.all().some((e) => e.type === "image"),
  );
  const img = await page.evaluate(() =>
    (window as unknown as EditorHook).__editor!.scene.all().find((e) => e.type === "image"),
  );
  expect(img?.w).toBe(2);
  expect(img?.h).toBe(1);
  await expect(page.getByTestId("photo-status")).toHaveCount(0);
});
