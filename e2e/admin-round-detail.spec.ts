import { expect, test } from "@playwright/test";

test("admin curates a round's menu items and opens then closes it", async ({ page }) => {
  const restaurantName = `Round Detail Test Restaurant ${Date.now()}`;
  const roundLabel = `Round Detail Test ${Date.now()}`;

  await page.goto("/admin/restaurants");
  await page.getByLabel("Name", { exact: false }).fill(restaurantName);
  await page.getByRole("button", { name: "Add restaurant" }).click();
  await page.getByRole("link", { name: restaurantName }).click();
  await expect(page.getByRole("heading", { name: restaurantName })).toBeVisible();

  await page.getByLabel("Name", { exact: false }).fill("Pho Bo");
  await page.getByRole("button", { name: "Add menu item" }).click();
  await expect(page.getByText("Menu item added")).toBeVisible();

  await page.goto("/admin/rounds");
  await page.getByLabel("Label", { exact: false }).fill(roundLabel);
  await page.getByLabel("Food restaurant", { exact: false }).selectOption({ label: restaurantName });
  await page.getByLabel("Deadline", { exact: false }).fill("2026-08-10T12:00");
  await page.getByRole("button", { name: "Add round" }).click();

  await page.getByRole("link", { name: roundLabel }).click();
  await expect(page.getByRole("heading", { name: roundLabel })).toBeVisible();

  await page.getByLabel("Pho Bo").click();
  await expect(page.getByText("Menu item added to round")).toBeVisible();
  await expect(page.getByLabel("Pho Bo")).toBeChecked();

  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("Round opened")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Round closed")).toBeVisible();
  await expect(page.getByText("This round is closed.")).toBeVisible();
});
