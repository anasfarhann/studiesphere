import { expect, test } from "@playwright/test";

type Stroke = { type: string; points: [number, number, number][]; simulatePressure: boolean };
type EditorHook = { __editor?: { scene: { all(): Stroke[] } } };

test.use({ viewport: { width: 834, height: 1194 } });

test("with snap on, a rough rectangle held still for 700 ms becomes a clean rectangle", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  await page.getByRole("button", { name: "Pen", exact: true }).click(); // already active -> opens its options
  const opts = page.getByRole("group", { name: "Pen options" });
  const snap = opts.getByRole("switch", { name: "Snap to shape" });
  await expect(snap).toHaveAttribute("aria-checked", "false");
  await snap.click();
  await expect(snap).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(opts).toBeHidden();

  const c = (await page.getByTestId("canvas").boundingBox())!;
  const x0 = c.x + 200;
  const y0 = c.y + 400;
  // A wobbly hand-drawn rectangle, 300 x 180 px.
  const corners: [number, number][] = [[0, 0], [300, 4], [296, 180], [-3, 176], [2, 3]];
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 0; i < corners.length - 1; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[i + 1];
    for (let k = 1; k <= 15; k++) {
      const t = k / 15;
      const wobble = k % 2 === 0 ? 1.5 : -1.5;
      await page.mouse.move(x0 + ax + (bx - ax) * t + wobble, y0 + ay + (by - ay) * t - wobble);
    }
  }
  await page.waitForTimeout(700);
  await page.mouse.up();

  const strokes = await page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all());
  expect(strokes).toHaveLength(1);
  const pts = strokes[0].points;
  expect(strokes[0].simulatePressure).toBe(false);
  expect(pts.at(-1)).toEqual(pts[0]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // Clean and axis-aligned: every point lies exactly on an edge of the bounding box.
  for (const [x, y] of pts) {
    const onEdge = Math.abs(x - minX) < 1e-6 || Math.abs(x - maxX) < 1e-6 || Math.abs(y - minY) < 1e-6 || Math.abs(y - maxY) < 1e-6;
    expect(onEdge).toBe(true);
  }
  expect(maxX - minX).toBeGreaterThan(280);
  expect(maxX - minX).toBeLessThan(320);
  expect(maxY - minY).toBeGreaterThan(160);
  expect(maxY - minY).toBeLessThan(200);
});

test("with snap on, lifting without a hold keeps the raw stroke", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await page.getByRole("group", { name: "Pen options" }).getByRole("switch", { name: "Snap to shape" }).click();
  await page.keyboard.press("Escape");
  const c = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(c.x + 200, c.y + 400);
  await page.mouse.down();
  await page.mouse.move(c.x + 500, c.y + 400, { steps: 10 });
  await page.mouse.move(c.x + 500, c.y + 580, { steps: 10 });
  await page.mouse.up();
  const strokes = await page.evaluate(() => (window as unknown as EditorHook).__editor!.scene.all());
  expect(strokes).toHaveLength(1);
  expect(strokes[0].simulatePressure).toBe(true); // the raw mouse stroke, not a snapped shape
  expect(strokes[0].points.at(-1)).not.toEqual(strokes[0].points[0]);
});
