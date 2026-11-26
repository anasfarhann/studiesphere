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

type SizeHook = {
  __editor: {
    scene: { all(): { id: string; type: string; text?: string; w?: number; autoW?: boolean }[] };
    camera: { zoom: number; worldToScreen(x: number, y: number): [number, number] };
    getSelectionBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null;
  };
};

for (const viewport of [
  { width: 834, height: 1194 },
  { width: 390, height: 844 },
]) {
  test.describe(`auto-width text at ${viewport.width}`, () => {
    test.use({ viewport });

    async function typeBox(page: import("@playwright/test").Page, text: string) {
      await page.goto("/dev/canvas");
      await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
      const canvas = (await page.getByTestId("canvas").boundingBox())!;
      await page.getByRole("button", { name: "Text", exact: true }).click();
      await page.mouse.click(canvas.x + 40, canvas.y + 200);
      await expect(page.getByTestId("text-editor")).toBeFocused();
      await page.keyboard.type(text);
      await page.keyboard.press("Escape");
      // Select it by tapping it with the lasso (after the double-tap window, which would reopen it for editing).
      await page.getByRole("button", { name: "Select (lasso)" }).click();
      await page.waitForTimeout(400);
      await page.mouse.click(canvas.x + 48, canvas.y + 210);
      const sel = () =>
        page.evaluate(() => {
          const ed = (window as unknown as SizeHook).__editor;
          const b = ed.getSelectionBounds();
          if (!b) return null;
          const [x0, y0] = ed.camera.worldToScreen(b.minX, b.minY);
          const [x1, y1] = ed.camera.worldToScreen(b.maxX, b.maxY);
          return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
        });
      const el = () => page.evaluate(() => (window as unknown as SizeHook).__editor.scene.all().find((e) => e.type === "text")!);
      return { canvas, sel, el };
    }

    test("a short word gets a narrow box (selection outline < 120 px)", async ({ page }) => {
      const { sel, el } = await typeBox(page, "test");
      expect(await el()).toMatchObject({ text: "test", autoW: true });
      const b = await sel();
      expect(b).not.toBeNull();
      expect(b!.w).toBeLessThan(120);
      expect(b!.w).toBeGreaterThan(20);
    });

    test("drag the right handle: fixed width, text wraps (taller); undo restores auto width", async ({ page }) => {
      const { canvas, sel, el } = await typeBox(page, "photosynthesis happens in leaves");
      const before = (await sel())!;
      const start = await el();
      expect(start.autoW).toBe(true);
      const y = canvas.y + (before.y0 + before.y1) / 2;
      await page.mouse.move(canvas.x + before.x1, y);
      await page.mouse.down();
      await page.mouse.move(canvas.x + before.x1 - before.w / 2, y, { steps: 6 });
      await page.mouse.up();
      const after = (await sel())!;
      expect(after.w).toBeLessThan(before.w - 20);
      expect(after.h).toBeGreaterThan(before.h + 10);
      expect(await el()).toMatchObject({ autoW: false });
      await expect(page.getByTestId("save-status")).toHaveText("Saved");
      await page.getByRole("button", { name: "Undo" }).click();
      expect(await el()).toMatchObject({ autoW: true, w: start.w });
    });
  });
}

test.describe("auto-width text near the screen edge at 390", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a long sentence wraps inside the screen while typing and after commit", async ({ page }) => {
    await page.goto("/dev/canvas");
    await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
    const canvas = (await page.getByTestId("canvas").boundingBox())!;
    await page.getByRole("button", { name: "Text", exact: true }).click();
    await page.mouse.click(canvas.x + 120, canvas.y + 300);
    const ta = page.getByTestId("text-editor");
    await expect(ta).toBeFocused();
    await page.keyboard.type("Photosynthesis converts light energy into chemical energy stored in glucose molecules");
    const tb = (await ta.boundingBox())!;
    expect(tb.x + tb.width).toBeLessThanOrEqual(390);
    expect(tb.height).toBeGreaterThan(40); // it wrapped
    await page.keyboard.press("Escape");
    const right = await page.evaluate(() => {
      const ed = (window as unknown as SizeHook).__editor;
      const el = ed.scene.all().find((e) => e.type === "text") as { x?: number; y?: number; w?: number };
      return ed.camera.worldToScreen(el.x! + el.w!, el.y!)[0];
    });
    expect(canvas.x + right).toBeLessThanOrEqual(390);
    // The canvas draws the same wrap: the box's height is its measured line count.
    const el = await page.evaluate(() => (window as unknown as SizeHook).__editor.scene.all().find((e) => e.type === "text") as unknown as { lines: number; fontSize: number });
    expect(el.lines).toBeGreaterThan(1);
    expect(Math.abs(el.lines * el.fontSize * 1.4 - tb.height)).toBeLessThanOrEqual(2);
  });
});
