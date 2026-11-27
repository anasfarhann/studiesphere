import { expect, test } from "@playwright/test";

test("manifest is reachable signed out and describes an installable app", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m.name).toBe("Studiesphere");
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBe("/app");
  expect(m.theme_color).toBe("#F6F2EE");
  expect(m.background_color).toBe("#F6F2EE");
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
});

test("icons are reachable signed out", async ({ request }) => {
  for (const p of ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png"]) {
    const res = await request.get(p, { maxRedirects: 0 });
    expect(res.status(), p).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
});

test("page links apple touch icon, theme colour and viewport-fit=cover", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#F6F2EE");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute("content", /user-scalable|maximum-scale/);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]').first()).toHaveAttribute("content", "yes");
});

test("body padding respects safe-area insets", async ({ page }) => {
  await page.goto("/");
  const rules = await page.evaluate(() => {
    const out: string[] = [];
    const walk = (list: CSSRuleList) => {
      for (const r of Array.from(list)) {
        if ("cssRules" in r && (r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
        if (r instanceof CSSStyleRule && r.selectorText === "body") out.push(r.cssText);
      }
    };
    for (const s of Array.from(document.styleSheets)) {
      try { walk(s.cssRules); } catch { /* cross-origin sheet */ }
    }
    return out.join("\n");
  });
  for (const side of ["top", "right", "bottom", "left"]) {
    expect(rules).toContain(`safe-area-inset-${side}`);
  }
});
