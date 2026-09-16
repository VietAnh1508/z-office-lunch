import { expect, test } from "@playwright/test";

// Must match apps/api/.env.test's ADMIN_PASSWORD, which dev:e2e's wrangler
// dev --env-file=.env.test loads for this run.
const CORRECT_PASSWORD = "e2e-test-password";

test("a fresh deep link into admin is locked, not just /admin itself", async ({ page }) => {
  await page.goto("/admin/restaurants");

  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add restaurant" })).not.toBeVisible();
});

test("a wrong password stays on the gate and shows an error", async ({ page }) => {
  await page.goto("/admin");

  await page.getByLabel("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page.getByText("Incorrect password.")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("the correct password unlocks admin content", async ({ page }) => {
  await page.goto("/admin");

  await page.getByLabel("Password").fill(CORRECT_PASSWORD);
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
});
