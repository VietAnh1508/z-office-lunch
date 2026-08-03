import { expect, test } from "@playwright/test";

test("clicking through the admin nav reaches each section", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();

  await page.getByRole("link", { name: "Restaurants" }).click();
  await expect(page.getByRole("button", { name: "Add restaurant" })).toBeVisible();

  await page.getByRole("link", { name: "Employees" }).click();
  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();

  await page.getByRole("link", { name: "Rounds" }).click();
  await expect(page.getByRole("heading", { name: "Rounds" })).toBeVisible();
});

test("deep-linking to a nested admin route is served by the SPA fallback", async ({ page }) => {
  await page.goto("/admin/employees");

  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();
});
