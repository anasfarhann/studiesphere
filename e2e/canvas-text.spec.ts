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
