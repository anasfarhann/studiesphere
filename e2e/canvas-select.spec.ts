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
      await expect(menu.getByRole("button")).toHaveText(["Remove background", "Crop", "Preview", "Delete", "Copy"]);
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
      await expect(menu.getByRole("button")).toHaveText(["Remove background", "Crop", "Preview", "Delete", "Copy"]);
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

    test("lasso two strokes → drag a corner → scaled about the opposite corner, menu clear of the handles, one undo", async ({ page }) => {
      await page.goto("/dev/canvas");
      await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
      const canvas = (await page.getByTestId("canvas").boundingBox())!;
      const ox = canvas.x + 60;
      const oy = canvas.y + 260;
      for (const [x0, y0, x1, y1] of [[0, 0, 80, 40], [40, 60, 120, 100]]) {
        await page.mouse.move(ox + x0, oy + y0);
        await page.mouse.down();
        await page.mouse.move(ox + x1, oy + y1, { steps: 6 });
        await page.mouse.up();
      }
      await page.getByRole("button", { name: "Select (lasso)" }).click();
      await page.mouse.move(ox - 30, oy - 30);
      await page.mouse.down();
      await page.mouse.move(ox + 160, oy - 30, { steps: 5 });
      await page.mouse.move(ox + 160, oy + 140, { steps: 5 });
      await page.mouse.move(ox - 30, oy + 140, { steps: 5 });
      await page.mouse.move(ox - 30, oy - 30, { steps: 5 });
      await page.mouse.up();
      type Sel = { selection: { ids: string[] }; getSelectionBounds(): { minX: number; minY: number; maxX: number; maxY: number }; undo(): void };
      const bounds = () =>
        page.evaluate(() => {
          const ed = (window as unknown as { __editor: Sel & NonNullable<EditorHook["__editor"]> }).__editor;
          const b = ed.getSelectionBounds();
          const [x0, y0] = ed.camera.worldToScreen(b.minX, b.minY);
          const [x1, y1] = ed.camera.worldToScreen(b.maxX, b.maxY);
          return { n: ed.selection.ids.length, x0, y0, x1, y1 };
        });
      const b0 = await bounds();
      expect(b0.n).toBe(2);
      // The menu stays off the top corners' 44 px touch targets.
      const menu = (await page.getByRole("toolbar", { name: "Selection actions" }).boundingBox())!;
      const overlaps = (cx: number, cy: number) =>
        menu.x < cx + 22 && menu.x + menu.width > cx - 22 && menu.y < cy + 22 && menu.y + menu.height > cy - 22;
      expect(overlaps(canvas.x + b0.x0, canvas.y + b0.y0)).toBe(false);
      expect(overlaps(canvas.x + b0.x1, canvas.y + b0.y0)).toBe(false);
      const w = b0.x1 - b0.x0;
      const h = b0.y1 - b0.y0;
      await page.mouse.move(canvas.x + b0.x1, canvas.y + b0.y1);
      await page.mouse.down();
      await page.mouse.move(canvas.x + b0.x0 + w * 1.5, canvas.y + b0.y0 + h * 1.5, { steps: 8 });
      await page.mouse.up();
      const b1 = await bounds();
      expect(b1.n).toBe(2);
      expect(Math.abs(b1.x0 - b0.x0)).toBeLessThan(1);
      expect(Math.abs(b1.y0 - b0.y0)).toBeLessThan(1);
      expect(Math.abs((b1.x1 - b1.x0) / w - 1.5)).toBeLessThan(0.02);
      expect(Math.abs((b1.y1 - b1.y0) / h - 1.5)).toBeLessThan(0.02);
      await page.keyboard.press("Control+z");
      const sizes = await page.evaluate(() =>
        (window as unknown as { __editor: { scene: { all(): { size?: number }[] } } }).__editor.scene.all().map((e) => e.size),
      );
      const pen = await page.evaluate(() => (window as unknown as { __editor: { settings: { pen: { size: number } } } }).__editor.settings.pen.size);
      expect(sizes).toEqual([pen, pen]);
    });
  });
}

test.describe("a file card at the selection's corner", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("dragging the corner over the card's open button scales the selection (the button steps aside)", async ({ page }) => {
    type Ed = {
      scene: { all(): El[] };
      camera: { worldToScreen(x: number, y: number): [number, number] };
      selection: { ids: string[]; set(ids: string[]): void };
      setTool(id: string): void;
      getSelectionBounds(): { minX: number; minY: number; maxX: number; maxY: number };
    };
    await page.goto("/dev/canvas");
    await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
    await page.getByTestId("file-input").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
    await page.waitForFunction(() => (window as unknown as EditorHook).__editor!.scene.all().some((e) => e.type === "file"));
    const canvas = (await page.getByTestId("canvas").boundingBox())!;
    const card = await page.evaluate(() => {
      const ed = (window as unknown as { __editor: Ed }).__editor;
      ed.setTool("pen");
      const f = ed.scene.all().find((e) => e.type === "file")!;
      const [x, y] = ed.camera.worldToScreen(f.x!, f.y!);
      return { x, y };
    });
    // A stroke below and right of the card: the card holds the selection's top-left corner.
    await page.mouse.move(canvas.x + card.x + 100, canvas.y + card.y + 100);
    await page.mouse.down();
    await page.mouse.move(canvas.x + card.x + 260, canvas.y + card.y + 160, { steps: 6 });
    await page.mouse.up();
    const bounds = () =>
      page.evaluate(() => {
        const ed = (window as unknown as { __editor: Ed }).__editor;
        const b = ed.getSelectionBounds();
        const [x0, y0] = ed.camera.worldToScreen(b.minX, b.minY);
        const [x1, y1] = ed.camera.worldToScreen(b.maxX, b.maxY);
        return { n: ed.selection.ids.length, x0, y0, x1, y1 };
      });
    await page.evaluate(() => {
      const ed = (window as unknown as { __editor: Ed }).__editor;
      ed.setTool("lasso");
      ed.selection.set(ed.scene.all().map((e) => e.id));
    });
    const b0 = await bounds();
    expect(b0.n).toBe(2);
    expect(Math.abs(b0.x0 - card.x)).toBeLessThan(1);
    // The press lands on the open button's area and inside the top-left handle's target.
    const px = canvas.x + b0.x0 + 14;
    const py = canvas.y + b0.y0 + 14;
    const open = page.getByRole("button", { name: "Open notes.pdf" });
    const ob = (await open.boundingBox())!;
    expect(px >= ob.x && px <= ob.x + ob.width && py >= ob.y && py <= ob.y + ob.height).toBe(true);
    await expect(open).toHaveClass(/pointer-events-none/);
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(px - 60, py - 30, { steps: 8 });
    await page.mouse.up();
    const b1 = await bounds();
    expect(b1.n).toBe(2);
    // Scaled up about the bottom-right corner (the stroke's), which stays put.
    expect(Math.abs(b1.x1 - b0.x1)).toBeLessThan(1);
    expect(Math.abs(b1.y1 - b0.y1)).toBeLessThan(1);
    expect(b1.x1 - b1.x0).toBeGreaterThan((b0.x1 - b0.x0) * 1.1);
    // Off the handles, the card's button works again.
    await page.evaluate(() => (window as unknown as { __editor: Ed }).__editor.selection.set([]));
    await expect(open).not.toHaveClass(/pointer-events-none/);
  });
});
