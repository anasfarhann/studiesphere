import { expect, test, type Page } from "@playwright/test";

type El = { id: string; type: string; x?: number; y?: number; w?: number; h?: number; assetPath?: string; crop?: unknown };
type EditorHook = { __editor?: { selection: { ids: string[] }; scene: { all(): El[] }; undo(): void } };

const image = (page: Page) => page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all().find((e) => e.type === "image")!);

async function insertDemoImage(page: Page, query = "") {
  await page.goto(`/dev/canvas${query}`);
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
  // Inserting selects the photo: its menu shows.
  await expect(page.getByRole("button", { name: "Remove background" })).toBeVisible();
}

for (const viewport of [
  { width: 834, height: 1194 },
  { width: 320, height: 640 },
]) {
  test.describe(`at ${viewport.width}`, () => {
    test.use({ viewport });

    test("one photo offers Remove background, Crop, Preview, Delete, Copy, all on screen and 44 px", async ({ page }) => {
      await insertDemoImage(page);
      const menu = page.getByRole("toolbar", { name: "Selection actions" });
      const names = await menu.getByRole("button").allTextContents();
      expect(names).toEqual(["Remove background", "Crop", "Preview", "Delete", "Copy"]);
      for (const b of await menu.getByRole("button").all()) {
        const box = (await b.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    });

    test("Remove background (stubbed) shows progress, replaces the photo, and one undo restores it", async ({ page }) => {
      await insertDemoImage(page, "?remover=stub");
      const before = await image(page);
      await page.getByRole("button", { name: "Remove background" }).click();
      const chip = page.getByTestId("background-status");
      await expect(chip).toContainText(/Removing background… \d+%/);
      await expect(chip.getByRole("button", { name: "Cancel" })).toBeVisible();
      await expect(chip).toHaveCount(0, { timeout: 10_000 });
      const after = await image(page);
      expect(after.assetPath).not.toBe(before.assetPath);
      expect(after.assetPath).toMatch(/^dev-owner\/dev-page\/.+\.png$/);
      expect({ x: after.x, y: after.y, w: after.w, h: after.h }).toEqual({ x: before.x, y: before.y, w: before.w, h: before.h });
      await page.getByRole("button", { name: "Undo" }).click();
      expect((await image(page)).assetPath).toBe(before.assetPath);
    });
  });
}

test("Cancel stops the removal and leaves the photo unchanged", async ({ page }) => {
  await insertDemoImage(page, "?remover=stub");
  const before = await image(page);
  await page.getByRole("button", { name: "Remove background" }).click();
  const chip = page.getByTestId("background-status");
  await chip.getByRole("button", { name: "Cancel" }).click();
  await expect(chip).toHaveCount(0);
  await page.waitForTimeout(2_000); // longer than the stub takes: a late result must not land
  expect(await image(page)).toEqual(before);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled(); // only the insert is undoable
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all().length)).toBe(0);
});

test("a failing removal says so and leaves the photo unchanged", async ({ page }) => {
  await insertDemoImage(page, "?remover=fail");
  const before = await image(page);
  await page.getByRole("button", { name: "Remove background" }).click();
  const chip = page.getByTestId("background-status");
  await expect(chip).toContainText("Couldn't remove the background. The photo is unchanged.", { timeout: 10_000 });
  expect(await image(page)).toEqual(before);
  await chip.getByRole("button", { name: "Dismiss" }).click();
  await expect(chip).toHaveCount(0);
});

test("the real remover runs in a worker and fails gracefully when its model cannot be downloaded", async ({ page }) => {
  const workers: string[] = [];
  page.on("worker", (w) => workers.push(w.url()));
  await insertDemoImage(page, "?remover=offline");
  const before = await image(page);
  await page.getByRole("button", { name: "Remove background" }).click();
  const chip = page.getByTestId("background-status");
  await expect(chip).toContainText("Couldn't remove the background", { timeout: 60_000 });
  expect(workers.length).toBeGreaterThan(0);
  expect(await image(page)).toEqual(before);
});

test("the background-removal library is not loaded until it is used", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", async (r) => {
    if (r.request().resourceType() !== "script") return;
    scripts.push(await r.text().catch(() => ""));
  });
  await insertDemoImage(page);
  await page.waitForLoadState("networkidle");
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.some((s) => s.includes("staticimgly") || s.includes("InferenceSession"))).toBe(false);
});

test("Preview opens the photo in an in-app lightbox; Escape and Close return focus", async ({ page }) => {
  await insertDemoImage(page);
  const opener = page.getByRole("button", { name: "Preview" });
  const pagesBefore = page.context().pages().length;
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Photo preview" });
  await expect(dialog).toBeVisible();
  const img = dialog.getByRole("img", { name: "Photo preview" });
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(200);
  const vp = page.viewportSize()!;
  const box = (await dialog.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(page.context().pages().length).toBe(pagesBefore); // no new tab
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
