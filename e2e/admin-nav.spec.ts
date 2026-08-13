import { expect, test } from "@playwright/test";

test("clicking through the admin nav reaches each section", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();

  // Scoped to the nav landmark: the overview page below also links to each
  // section (via its summary cards), sharing the same accessible names.
  const nav = page.getByRole("navigation");

  await nav.getByRole("link", { name: "Restaurants" }).click();
  await expect(page.getByRole("button", { name: "Add restaurant" })).toBeVisible();

  await nav.getByRole("link", { name: "Employees" }).click();
  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();

  await nav.getByRole("link", { name: "Rounds" }).click();
  await expect(page.getByRole("heading", { name: "Rounds" })).toBeVisible();
});

test("deep-linking to a nested admin route is served by the SPA fallback", async ({ page }) => {
  await page.goto("/admin/employees");

  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();
});
