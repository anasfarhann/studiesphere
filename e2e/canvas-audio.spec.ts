import { expect, test } from "@playwright/test";

type EditorHook = { __editor?: { scene: { all(): { type: string; durationMs?: number }[] } } };

test("recording adds a voice card that can be played", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByTestId("recording-timer")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.waitForFunction(() =>
    (window as unknown as EditorHook).__editor!.scene.all().some((e) => e.type === "audio"),
  );
  const card = await page.evaluate(() =>
    (window as unknown as EditorHook).__editor!.scene.all().find((e) => e.type === "audio"),
  );
  expect(card?.durationMs).toBeGreaterThan(1000);
  await expect(page.getByTestId("audio-status")).toHaveCount(0);
  await page.getByRole("button", { name: "Play recording" }).click();
  await expect(page.getByRole("button", { name: "Pause recording" })).toBeVisible();
});

