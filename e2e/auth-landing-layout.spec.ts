import { expect, test } from "@playwright/test";

const viewports = [
  { name: "small phone", width: 320, height: 640, panel: false },
  { name: "phone", width: 390, height: 844, panel: false },
  { name: "iPad", width: 834, height: 1194, panel: true },
  { name: "laptop", width: 1280, height: 820, panel: true },
];

async function overflowX(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

for (const vp of viewports) {
  for (const path of ["/login", "/signup", "/", "/forgot-password", "/reset-password"]) {
    test(`${path} has no horizontal overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const brand = page.getByText("Everything for studying, in one place.");
      if (vp.panel) await expect(brand).toBeVisible();
      else await expect(brand).toBeHidden();
      expect(await overflowX(page)).toBeLessThanOrEqual(0);
    });
  }

  test(`sign-in layout at ${vp.name}: heading, Forgot link and form fit`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Welcome back", level: 1 })).toBeInViewport();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    // Touch targets on the form are at least 44 px tall.
    for (const target of [
      page.getByRole("link", { name: "Forgot password?" }),
      page.getByRole("button", { name: "Show password" }),
      page.getByRole("button", { name: "Sign in" }),
      page.getByRole("link", { name: "Create a free account" }),
    ]) {
      const box = await target.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await overflowX(page)).toBeLessThanOrEqual(0);
  });
}
