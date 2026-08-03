import { expect, test } from "@playwright/test";

test("admin can add a menu item to a restaurant and toggle it inactive", async ({ page }) => {
  await page.goto("/admin/restaurants");

  const restaurantName = `Detail Test Restaurant ${Date.now()}`;
  await page.getByLabel("Name", { exact: false }).fill(restaurantName);
  await page.getByRole("button", { name: "Add restaurant" }).click();

  await page.getByRole("link", { name: restaurantName }).click();
  await expect(page.getByRole("heading", { name: restaurantName })).toBeVisible();

  await page.getByLabel("Name", { exact: false }).fill("Banh Mi");
  await page.getByLabel("Price", { exact: false }).fill("3.50");
  await page.getByRole("button", { name: "Add menu item" }).click();

  await expect(page.getByText("Banh Mi")).toBeVisible();
  await expect(page.getByText("3.50", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByRole("button", { name: "Activate" })).toBeVisible();
});
