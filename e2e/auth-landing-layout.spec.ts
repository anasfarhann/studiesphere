import { expect, test } from "@playwright/test";

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "iPad", width: 834, height: 1194 },
];

for (const vp of viewports) {
  for (const path of ["/login", "/signup", "/"]) {
    test(`${path} has no horizontal overflow at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(path);
      await expect(page.getByText("Everything for studying, in one place.")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}
