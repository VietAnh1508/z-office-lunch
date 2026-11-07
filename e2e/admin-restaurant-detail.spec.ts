import { expect, test } from "@playwright/test";
import { unlockAdmin } from "./helpers";

test("admin can add a menu item to a restaurant and toggle it inactive", async ({ page }) => {
  await unlockAdmin(page);
  await page.goto("/admin/restaurants");

  const restaurantName = `Detail Test Restaurant ${Date.now()}`;
  await page.getByLabel("Name", { exact: false }).fill(restaurantName);
  await page.getByRole("button", { name: "Add restaurant" }).click();

  await page.getByRole("link", { name: restaurantName }).click();
  await expect(page.getByRole("heading", { name: restaurantName })).toBeVisible();

  await page.locator("#menu-item-name").fill("Banh Mi");
  await page.locator("#menu-item-price").fill("25000");
  await page.getByRole("button", { name: "Add menu item", exact: true }).click();

  await expect(page.getByText("Banh Mi")).toBeVisible();
  await expect(page.getByText("25.000", { exact: false })).toBeVisible();
  await expect(page.getByText("Menu item added")).toBeVisible();

  await page.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByRole("button", { name: "Activate" })).toBeVisible();
  await expect(page.getByText("Banh Mi")).toHaveClass(/line-through/);
  await expect(page.getByText("Menu item deactivated")).toBeVisible();
});

test("admin assigns a size preset to a drink restaurant and unticks a size on an item", async ({
  page,
}) => {
  await unlockAdmin(page);
  const stamp = Date.now();
  const presetName = `E2E cups ${stamp}`;

  await page.goto("/admin/sizes");
  await page.getByLabel("Preset name", { exact: false }).fill(presetName);
  await page.getByLabel("Options", { exact: false }).fill("S\nM\nL");
  await page.getByRole("button", { name: "Add preset" }).click();
  await expect(page.getByText("Size preset added")).toBeVisible();

  await page.goto("/admin/restaurants");
  const restaurantName = `Drink Sizes ${stamp}`;
  await page.getByLabel("Name", { exact: false }).fill(restaurantName);
  await page.locator("#restaurant-type").selectOption("drink");
  await page.getByLabel("Size preset").selectOption({ label: `${presetName} (S / M / L)` });
  await page.getByRole("button", { name: "Add restaurant" }).click();
  await page.getByRole("link", { name: restaurantName }).click();

  await page.locator("#menu-item-name").fill("Milk Tea");
  await page.getByRole("button", { name: "Add menu item", exact: true }).click();
  await expect(page.getByText("Menu item added")).toBeVisible();

  await page.getByRole("button", { name: "Edit menu item" }).click();
  await expect(page.getByRole("checkbox", { name: "L" })).toBeChecked();
  await page.getByRole("checkbox", { name: "L" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).last().click();
  await expect(page.getByText("Menu item sizes updated")).toBeVisible();

  await page.getByRole("button", { name: "Edit menu item" }).click();
  await expect(page.getByRole("checkbox", { name: "S" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "L" })).not.toBeChecked();
});
