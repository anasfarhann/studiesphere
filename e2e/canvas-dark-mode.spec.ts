import { expect, test } from "@playwright/test";

type EditorHook = { __editor?: unknown };

test.use({ colorScheme: "dark" });

/** Relative luminance-ish brightness of an `rgb(...)`/`rgba(...)` string, 0..255. */
function brightness(rgb: string): number {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m) throw new Error(`unparseable colour ${rgb}`);
  const [r, g, b] = m.map(Number);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

test("under a dark system theme the app stays light: text is dark, the page is white", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  const colours = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { text: body.color, bg: body.backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme };
  });
  expect(colours.scheme).toBe("light");
  expect(brightness(colours.text)).toBeLessThan(80);
  expect(brightness(colours.bg)).toBeGreaterThan(200);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "light");
});

test("under a dark system theme, overlay panels keep explicit dark text", async ({ page }) => {
  await page.goto("/dev/canvas");
  await page.waitForFunction(() => (window as unknown as EditorHook).__editor !== undefined);
  // A file that is too big shows the FileStatus overlay without touching the network.
  await page.evaluate(() => {
    const input = document.querySelector('[data-testid="file-input"]') as HTMLInputElement;
    const big = new File([new Uint8Array(51 * 1024 * 1024)], "huge.pdf", { type: "application/pdf" });
    const dt = new DataTransfer();
    dt.items.add(big);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const status = page.getByTestId("file-status");
  await expect(status).toBeVisible();
  const text = await status.evaluate((el) => getComputedStyle(el).color);
  expect(brightness(text)).toBeLessThan(80);
});
