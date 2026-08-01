import { expect, test } from "@playwright/test";

test("API health check reaches Postgres through the Hyperdrive binding", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: "ok", db: "ok" });
});

test("SPA shell loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Office Lunch" })).toBeVisible();
});
