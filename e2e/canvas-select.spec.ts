import { expect, test, type Page } from "@playwright/test";

type El = { id: string; type: string; x?: number; y?: number; w?: number; h?: number; assetPath?: string };
type EditorHook = {
  __editor?: { scene: { all(): El[] }; camera: { worldToScreen(x: number, y: number): [number, number] } };
};

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
  // The image's screen rectangle (relative to the canvas).
  return page.evaluate(() => {
    const ed = (window as unknown as EditorHook).__editor!;
    const img = ed.scene.all().find((e) => e.type === "image")!;
    const [x0, y0] = ed.camera.worldToScreen(img.x!, img.y!);
    const [x1, y1] = ed.camera.worldToScreen(img.x! + img.w!, img.y! + img.h!);
    return { x0, y0, x1, y1 };
  });
}

async function expectInViewport(page: Page, name: string) {
  const vp = page.viewportSize()!;
  const box = (await page.getByRole("toolbar", { name }).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
}

for (const viewport of [
  { width: 834, height: 1194 },
  { width: 390, height: 844 },
]) {
  test.describe(`at ${viewport.width}`, () => {
    test.use({ viewport });

    test("lasso partly over an image → Delete/Copy → Copy → tap empty → Paste → two images", async ({ page }) => {
      const img = await insertDemoImage(page);
      await page.getByRole("button", { name: "Select (lasso)" }).click();
      const canvas = (await page.getByTestId("canvas").boundingBox())!;
      // A loop around the image's top-left corner only (its centre stays outside).
      const cx = canvas.x + img.x0;
      const cy = canvas.y + img.y0;
      await page.mouse.move(cx - 40, cy - 40);
      await page.mouse.down();
      await page.mouse.move(cx + 30, cy - 40, { steps: 5 });
      await page.mouse.move(cx + 30, cy + 30, { steps: 5 });
      await page.mouse.move(cx - 40, cy + 30, { steps: 5 });
      await page.mouse.move(cx - 40, cy - 40, { steps: 5 });
      await page.mouse.up();

      const menu = page.getByRole("toolbar", { name: "Selection actions" });
      await expect(menu.getByRole("button")).toHaveText(["Delete", "Copy"]);
      for (const b of await menu.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expectInViewport(page, "Selection actions");

      await menu.getByRole("button", { name: "Copy" }).click();
      await expect(menu.getByRole("button", { name: "Copied" })).toBeVisible();

      // Tap empty space below the image.
      const tapX = canvas.x + (img.x0 + img.x1) / 2;
      const tapY = canvas.y + Math.min(img.y1 + 200, canvas.height - 150);
      await page.mouse.click(tapX, tapY);
      await expect(menu.getByRole("button")).toHaveText(["Paste"]);
      await expectInViewport(page, "Selection actions");
      await menu.getByRole("button", { name: "Paste" }).click();

      await expect
        .poll(() => page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all().filter((e) => e.type === "image").length))
        .toBe(2);
      const images = await page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all().filter((e) => e.type === "image"));
      expect(images[0].id).not.toBe(images[1].id);
      expect(images[1].assetPath).toBe(images[0].assetPath);
      // The pasted copy is selected.
      await expect(menu.getByRole("button")).toHaveText(["Delete", "Copy"]);
    });

    test("tap a stroke → Colour with the wheel open stays on screen and recolours", async ({ page }) => {
      await page.goto("/dev/canvas");
      await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
      const canvas = (await page.getByTestId("canvas").boundingBox())!;
      const y = canvas.y + canvas.height - 120;
      await page.mouse.move(canvas.x + 20, y);
      await page.mouse.down();
      await page.mouse.move(canvas.x + canvas.width - 20, y, { steps: 10 });
      await page.mouse.up();
      await page.getByRole("button", { name: "Select (lasso)" }).click();
      await page.mouse.click(canvas.x + canvas.width / 2, y + 3);
      const menu = page.getByRole("toolbar", { name: "Selection actions" });
      await expect(menu.getByRole("button")).toHaveText(["Delete", "Colour", "Copy"]);
      await menu.getByRole("button", { name: "Colour", exact: true }).click();
      await menu.getByRole("button", { name: "Colour #DC2626" }).click();
      await menu.getByRole("button", { name: "Colour #DC2626" }).click(); // the selected swatch opens the wheel
      await expect(menu.getByRole("slider", { name: "Hue" })).toBeVisible();
      await expectInViewport(page, "Selection actions");
      const colors = await page.evaluate(() =>
        (window as unknown as { __editor: { scene: { all(): { color?: string }[] } } }).__editor.scene.all().map((e) => e.color),
      );
      expect(colors).toEqual(["#DC2626"]);
    });
  });
}
