import { expect, test } from "@playwright/test";

// A single test opens one round and exercises both the happy path (food +
// drink) and the duplicate-submission rejection against it, rather than each
// getting its own round — only one round can be open at a time app-wide, so
// two independent "open a round" tests risk colliding with each other (or
// with an already-open round left over from manual testing) under parallel
// workers.
test("employee submits food and drink picks, then a second submission is rejected", async ({
  page,
}) => {
  const foodRestaurantName = `Submission Test Food ${Date.now()}`;
  const drinkRestaurantName = `Submission Test Drink ${Date.now()}`;
  const roundLabel = `Submission Test Round ${Date.now()}`;
  const employeeName = `Submission Test Employee ${Date.now()}`;

  // Food restaurant + menu item.
  await page.goto("/admin/restaurants");
  await page.locator("#restaurant-name").fill(foodRestaurantName);
  await page.getByRole("button", { name: "Add restaurant" }).click();
  await page.getByRole("link", { name: foodRestaurantName }).click();
  await expect(page.getByRole("heading", { name: foodRestaurantName })).toBeVisible();
  await page.locator("#menu-item-name").fill("Pho Bo");
  await page.getByRole("button", { name: "Add menu item" }).click();
  await expect(page.getByText("Menu item added")).toBeVisible();

  // Drink restaurant + menu item.
  await page.goto("/admin/restaurants");
  await page.locator("#restaurant-name").fill(drinkRestaurantName);
  await page.locator("#restaurant-type").selectOption("drink");
  await page.getByRole("button", { name: "Add restaurant" }).click();
  await page.getByRole("link", { name: drinkRestaurantName }).click();
  await expect(page.getByRole("heading", { name: drinkRestaurantName })).toBeVisible();
  await page.locator("#menu-item-name").fill("Tra Da");
  await page.getByRole("button", { name: "Add menu item" }).click();
  await expect(page.getByText("Menu item added")).toBeVisible();

  // Employee.
  await page.goto("/admin/employees");
  await page.getByLabel("Full name", { exact: false }).fill(employeeName);
  await page.getByRole("button", { name: "Add employee" }).click();
  await expect(page.getByText("Employee added")).toBeVisible();

  // Round: food + drink, curate both items, open.
  await page.goto("/admin/rounds");
  await page.getByLabel("Label", { exact: false }).fill(roundLabel);
  await page.locator("#round-food-restaurant").selectOption({ label: foodRestaurantName });
  await page.locator("#round-drink-restaurant").selectOption({ label: drinkRestaurantName });
  await page.getByLabel("Deadline", { exact: false }).fill("2030-01-01T12:00");
  await page.getByRole("button", { name: "Add round" }).click();

  await page.getByRole("link", { name: roundLabel }).click();
  await expect(page.getByRole("heading", { name: roundLabel })).toBeVisible();
  const roundUrl = page.url();
  const roundId = roundUrl.substring(roundUrl.lastIndexOf("/") + 1);

  await page.getByLabel("Pho Bo").click();
  await expect(page.getByText("Menu item added to round")).toBeVisible();
  await page.getByLabel("Tra Da").click();
  await expect(page.getByText("Menu item added to round")).toBeVisible();

  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("Round opened")).toBeVisible();

  // First submission: the happy path, food + drink.
  await page.goto(`/r/${roundId}`);
  await expect(page.getByRole("heading", { name: roundLabel })).toBeVisible();

  const employeeInput = page.getByRole("combobox", { name: "Your name", exact: false });
  await employeeInput.fill(employeeName);
  await page.getByRole("option", { name: employeeName }).click();

  await page.getByLabel("Food item", { exact: false }).selectOption({ label: "Pho Bo" });
  await page.getByLabel("Drink item", { exact: false }).selectOption({ label: "Tra Da" });
  await page.getByLabel("Drink note", { exact: false }).fill("Less ice");

  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Thanks! Your order has been recorded.")).toBeVisible();

  // Second submission for the same round + employee: rejected, not upserted.
  await page.goto(`/r/${roundId}`);
  await page.getByRole("combobox", { name: "Your name", exact: false }).fill(employeeName);
  await page.getByRole("option", { name: employeeName }).click();
  await page.getByLabel("Food item", { exact: false }).selectOption({ label: "Pho Bo" });
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("you have already submitted for this round")).toBeVisible();

  // Only one round can be open at a time app-wide — leaving this one open
  // would block every other spec's own "Open" step for the rest of the run.
  await page.goto(`/admin/rounds/${roundId}`);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Round closed")).toBeVisible();
});
