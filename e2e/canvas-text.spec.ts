import { expect, test } from "@playwright/test";

type EditorHook = { __editor?: { scene: { all(): { type: string; text?: string }[] } } };

test("type text, commit by switching tool, reload: the text is still there", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  const canvas = page.getByTestId("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no box");

  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(box.x + 120, box.y + 120);
  const editor = page.getByTestId("text-editor");
  await expect(editor).toBeFocused();
  await page.keyboard.type("Mitochondria");
  await page.keyboard.press("Escape");

  const texts = () =>
    page.evaluate(() =>
      (window as unknown as EditorHook).__editor!.scene.all().filter((e) => e.type === "text").map((e) => e.text),
    );
  expect(await texts()).toEqual(["Mitochondria"]);

  // Autosave, then reload: the dev store keeps the page for the tab session.
  await expect(page.getByTestId("save-status")).toHaveText("Saved");
  await page.reload();
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor?.scene.all().length === 1);
  expect(await texts()).toEqual(["Mitochondria"]);
});

test("double-click a text box with the pen tool edits it", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  const box = await page.getByTestId("canvas").boundingBox();
  if (!box) throw new Error("canvas has no box");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(box.x + 150, box.y + 150);
  await page.keyboard.type("Ribosome");
  await page.keyboard.press("Control+Enter");
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.mouse.click(box.x + 160, box.y + 160);
  await page.mouse.click(box.x + 160, box.y + 160);
  const editor = page.getByTestId("text-editor");
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue("Ribosome");
});

test("choose serif + bold, then type: the element is saved with that font and weight", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  const box = await page.getByTestId("canvas").boundingBox();
  if (!box) throw new Error("canvas has no box");
  const toolBtn = page.getByRole("button", { name: "Text", exact: true });
  await toolBtn.click();
  await toolBtn.click(); // second tap opens the text options
  await page.getByRole("radio", { name: "Serif" }).click();
  await page.getByRole("button", { name: "Bold" }).click();
  await page.mouse.click(box.x + 200, box.y + 200);
  await expect(page.getByTestId("text-editor")).toBeFocused();
  await page.keyboard.type("Lipids");
  await page.keyboard.press("Escape");
  const els = await page.evaluate(() =>
    (window as unknown as { __editor: { scene: { all(): Record<string, unknown>[] } } }).__editor.scene.all().filter((e) => e.type === "text"),
  );
  expect(els).toHaveLength(1);
  expect(els[0]).toMatchObject({ text: "Lipids", font: "serif", bold: true });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`text options panel stays inside the viewport at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/dev/canvas");
    await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
    const box = await page.getByTestId("canvas").boundingBox();
    if (!box) throw new Error("canvas has no box");
    await page.getByRole("button", { name: "Text", exact: true }).click();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.type("Golgi");
    await page.keyboard.press("Escape");
    // Select the new box with the lasso tool.
    await page.evaluate(() => {
      const ed = (window as unknown as { __editor: { setTool(t: string): void; selection: { set(ids: string[]): void }; scene: { all(): { id: string; type: string }[] } } }).__editor;
      ed.setTool("lasso");
      ed.selection.set(ed.scene.all().filter((e) => e.type === "text").map((e) => e.id));
    });
    await page.getByRole("button", { name: "Text options" }).click();
    const panel = page.getByRole("group", { name: "Text options" });
    await expect(panel).toBeVisible();
    // Open the colour wheel (a custom colour control inside the panel).
    // Tapping the selected swatch opens the colour wheel.
    const wheelBtn = panel.locator('button[aria-pressed="true"][aria-expanded]').first();
    await wheelBtn.scrollIntoViewIfNeeded();
    await wheelBtn.click();
    await expect(panel.getByRole("group", { name: "Colour wheel" })).toBeAttached();
    const inside = async () => {
      const b = await panel.boundingBox();
      if (!b) throw new Error("no panel box");
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeLessThanOrEqual(viewport.height);
      expect(b.x + b.width).toBeLessThanOrEqual(viewport.width);
    };
    await inside();
    // Every control is reachable by scrolling the panel.
    for (const c of [panel.getByRole("radio", { name: /Serif/ }).first(), panel.getByRole("button", { name: /Bold/ }).first()]) {
      await c.scrollIntoViewIfNeeded();
      await expect(c).toBeInViewport();
    }
    await inside();
  });
}
