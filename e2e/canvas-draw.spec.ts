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

test("at phone width the bottom notices stack without overlapping", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/canvas?demo=notices");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  const names = ["audio-status", "photo-status", "file-status"];
  const boxes = [];
  for (const id of names) {
    const el = page.getByTestId(id);
    await expect(el).toBeVisible();
    const b = await el.boundingBox();
    if (!b) throw new Error(`${id} has no box`);
    boxes.push(b);
  }
  for (let i = 0; i < boxes.length; i++) {
    expect(boxes[i].x).toBeGreaterThanOrEqual(0);
    expect(boxes[i].x + boxes[i].width).toBeLessThanOrEqual(390);
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${names[i]} vs ${names[j]}`).toBe(false);
    }
  }
});

for (const [w, h] of [[834, 1194], [1280, 720], [390, 844]] as const) {
  test(`history panel opens below the top bar at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/dev/canvas");
    await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
    await page.getByRole("button", { name: "Page history" }).click();
    const panel = await page.getByRole("complementary", { name: "Page history" }).boundingBox();
    const bar = await page.getByTestId("canvas-topbar").boundingBox();
    if (!panel || !bar) throw new Error("missing box");
    expect(panel.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  });
}

for (const vp of [
  { name: "iPad portrait", width: 834, height: 1194 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`toolbar keeps the pen, File and Record fully inside the viewport (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/dev/canvas");
    await expect(page.getByTestId("canvas")).toBeVisible();
    for (const name of ["Pen", "File", "Record"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      if (!box) throw new Error(`${name} has no box`);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

type SettingsHook = { __editor?: { scene: { all(): Array<{ size?: number; color?: string }> }; settings: { pen: { size: number; color: string } } } };

for (const [w, h] of [[834, 1194], [390, 844]] as const) {
  test(`tapping the active Pen opens its options, the slider sets the stroke size, Escape closes (${w}px)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/dev/canvas");
    await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
    const pen = page.getByRole("button", { name: "Pen", exact: true });
    await expect(pen).toHaveAttribute("aria-expanded", "false");
    await pen.click();
    await expect(pen).toHaveAttribute("aria-expanded", "true");
    const slider = page.getByRole("slider", { name: "Pen size" });
    await expect(slider).toBeVisible();
    await slider.fill("12");
    await expect(page.getByText("12 px")).toBeVisible();

    // Every control in the panel sits inside the viewport and is at least 44px tall.
    const controls = page.locator("#tool-options").getByRole("slider").or(page.locator("#tool-options button"));
    const n = await controls.count();
    expect(n).toBeGreaterThan(1);
    for (let i = 0; i < n; i++) {
      const b = await controls.nth(i).boundingBox();
      if (!b) throw new Error("control has no box");
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(w);
      expect(b.y + b.height).toBeLessThanOrEqual(h);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    const red = page.getByRole("button", { name: "Colour #DC2626" });
    await red.click();
    await expect(red).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("Escape");
    await expect(pen).toHaveAttribute("aria-expanded", "false");
    await expect(pen).toBeFocused();

    const canvas = page.getByTestId("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("canvas has no box");
    await page.mouse.move(box.x + 100, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 350, { steps: 8 });
    await page.mouse.up();
    const stroke = await page.evaluate(() => (window as unknown as SettingsHook).__editor!.scene.all()[0]);
    expect(stroke).toMatchObject({ size: 12, color: "#DC2626" });
  });
}

test("tapping outside closes the tool options", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/canvas");
  const pen = page.getByRole("button", { name: "Pen", exact: true });
  await pen.click();
  await expect(pen).toHaveAttribute("aria-expanded", "true");
  await page.mouse.click(200, 700);
  await expect(pen).toHaveAttribute("aria-expanded", "false");
});
