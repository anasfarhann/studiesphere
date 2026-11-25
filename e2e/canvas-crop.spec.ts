import { expect, test, type Page } from "@playwright/test";

type El = { id: string; type: string; x?: number; y?: number; w?: number; h?: number; crop?: { x: number; y: number; w: number; h: number } };
type EditorHook = { __editor?: { tool: string; selection: { ids: string[] }; scene: { all(): El[] } } };

async function insertDemoImage(page: Page) {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 150;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(0, 0, 200, 150);
    return c.toDataURL("image/png");
  });
  const buffer = Buffer.from(dataUrl.split(",")[1], "base64");
  await page.getByTestId("photo-input").setInputFiles({ name: "demo.png", mimeType: "image/png", buffer });
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor!.scene.all().some((e) => e.type === "image"));
}

for (const viewport of [
  { width: 834, height: 1194 },
  { width: 390, height: 844 },
]) {
  test.describe(`at ${viewport.width}`, () => {
    test.use({ viewport });

    test("insert selects the image; Crop → drag right edge left → Done sets a crop; Cancel changes nothing", async ({ page }) => {
      await insertDemoImage(page);
      // Auto-selected: lasso tool, the image selected, Crop offered.
      const state = await page.evaluate(() => {
        const ed = (window as unknown as EditorHook).__editor!;
        return { tool: ed.tool, ids: ed.selection.ids, img: ed.scene.all().find((e) => e.type === "image")!.id };
      });
      expect(state.tool).toBe("lasso");
      expect(state.ids).toEqual([state.img]);

      const orig = await page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all().find((e) => e.type === "image")!);
      await page.getByRole("button", { name: "Crop" }).click();
      const vp = page.viewportSize()!;
      const bar = (await page.getByRole("toolbar", { name: "Crop controls" }).boundingBox())!;
      expect(bar.x).toBeGreaterThanOrEqual(0);
      expect(bar.x + bar.width).toBeLessThanOrEqual(vp.width);
      expect(bar.y + bar.height).toBeLessThanOrEqual(vp.height);
      for (const name of ["Done", "Cancel", "Reset"]) {
        const b = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.width).toBeGreaterThanOrEqual(44);
      }
      const handle = (await page.getByTestId("crop-handle-e").boundingBox())!;
      expect(handle.width).toBeGreaterThanOrEqual(44);
      const hx = handle.x + handle.width / 2;
      const hy = handle.y + handle.height / 2;

      // Cancel after a drag leaves the image alone.
      await page.mouse.move(hx, hy);
      await page.mouse.down();
      await page.mouse.move(hx - 40, hy, { steps: 4 });
      await page.mouse.up();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(await page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all().find((e) => e.type === "image")!.crop)).toBeUndefined();

      await page.getByRole("button", { name: "Crop" }).click();
      const h2 = (await page.getByTestId("crop-handle-e").boundingBox())!;
      const x2 = h2.x + h2.width / 2;
      const y2 = h2.y + h2.height / 2;
      await page.mouse.move(x2, y2);
      await page.mouse.down();
      await page.mouse.move(x2 - 60, y2, { steps: 6 });
      await page.mouse.up();
      await page.getByRole("button", { name: "Done", exact: true }).click();
      const crop = await page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all().find((e) => e.type === "image")!.crop);
      expect(crop).toBeDefined();
      expect(crop!.w).toBeLessThan(1);
      await expect(page.getByTestId("crop-overlay")).toHaveCount(0);

      // Toolbar undo/redo are off while cropping; Reset then Done restores the full image.
      await page.getByRole("button", { name: "Crop" }).click();
      await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
      await page.getByRole("button", { name: "Reset", exact: true }).click();
      await page.getByRole("button", { name: "Done", exact: true }).click();
      const full = await page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all().find((e) => e.type === "image")!);
      expect(full.crop).toBeUndefined();
      expect(full.w).toBeCloseTo(orig.w!);
      expect(full.h).toBeCloseTo(orig.h!);
    });
  });
}
