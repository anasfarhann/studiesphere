import { expect, test } from "@playwright/test";

type EditorHook = { __editor?: { scene: { all(): { type: string; fileName?: string; mime?: string; bytes?: number }[] } } };

test("attaching a PDF adds a file card with an open button", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  const buffer = Buffer.from("%PDF-1.4\n%%EOF\n");
  await page.getByTestId("file-input").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer });
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor!.scene.all().some((e) => e.type === "file"));
  const el = await page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all().find((e) => e.type === "file"));
  expect(el).toMatchObject({ fileName: "notes.pdf", mime: "application/pdf", bytes: buffer.length });
  await expect(page.getByRole("button", { name: "Open notes.pdf" })).toBeVisible();
  await expect(page.getByTestId("file-status")).toHaveCount(0);
});

test("a PDF card with a thumbnail shows the first-page image above the card", async ({ page }) => {
  await page.goto("/dev/canvas?demo=thumb");
  const img = page.getByTestId("file-thumb");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await expect(page.getByRole("button", { name: "Open demo.pdf" })).toBeVisible();
});
