import { expect, test } from "@playwright/test";

const expired = (page: import("@playwright/test").Page) =>
  expect(page.getByRole("heading", { name: "This link has expired", level: 1 })).toBeVisible();

test("a recovery link with an error fragment ends on the expired state", async ({ page }) => {
  let posted = false;
  await page.route("**/auth/recovery/session", (route) => {
    posted = true;
    return route.fulfill({ status: 403 });
  });
  await page.goto("/auth/recovery#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  await expect(page).toHaveURL(/localhost:3100\/reset-password$/);
  await expired(page);
  expect(posted).toBe(false);
});

test("a refused token fragment ends on the expired state, with the tokens gone from the URL", async ({ page }) => {
  let body: unknown = null;
  await page.route("**/auth/recovery/session", (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({ status: 403 });
  });
  await page.goto("/auth/recovery#access_token=fake-at&refresh_token=fake-rt&expires_in=3600&token_type=bearer&type=recovery");
  await expect(page).toHaveURL(/localhost:3100\/reset-password$/);
  await expired(page);
  expect(body).toEqual({ access_token: "fake-at", refresh_token: "fake-rt" });
  expect(page.url()).not.toContain("fake-at");
});

test("the session route refuses cross-origin and malformed posts", async ({ request }) => {
  const cross = await request.post("/auth/recovery/session", {
    headers: { origin: "https://evil.example" },
    data: { access_token: "a", refresh_token: "b" },
  });
  expect(cross.status()).toBe(403);
  const missing = await request.post("/auth/recovery/session", { headers: { origin: "http://localhost:3100" }, data: { access_token: "a" } });
  expect(missing.status()).toBe(400);
});
