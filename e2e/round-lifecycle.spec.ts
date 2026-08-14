import { expect, test } from "@playwright/test";

// These three tests each open one round, and the app only allows one round
// open at a time app-wide (409 if you try to open a second). Keeping them
// together in a single file — rather than split across files as before —
// means Playwright's default fullyParallel:false runs them sequentially in
// one worker, so their "Open" steps can't race a concurrent worker's own
// open round and time out waiting for a "Round opened" toast that never
// comes. See public-round-submission's own two-tests-merged-into-one for the
// same reasoning at the single-file level.

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

test("employee-facing public round link reflects open then closed state", async ({ page }) => {
  const restaurantName = `Public Round Test Restaurant ${Date.now()}`;
  const roundLabel = `Public Round Test ${Date.now()}`;

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
  // Far in the future so the public page's "deadline passed" branch doesn't
  // trigger while this spec exercises the "open, before deadline" state.
  await page.getByLabel("Deadline", { exact: false }).fill("2030-01-01T12:00");
  await page.getByRole("button", { name: "Add round" }).click();

  await page.getByRole("link", { name: roundLabel }).click();
  await expect(page.getByRole("heading", { name: roundLabel })).toBeVisible();
  const roundUrl = page.url();
  const roundId = roundUrl.substring(roundUrl.lastIndexOf("/") + 1);

  await page.getByLabel("Pho Bo").click();
  await expect(page.getByText("Menu item added to round")).toBeVisible();

  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("Round opened")).toBeVisible();

  await page.goto(`/r/${roundId}`);
  await expect(page.getByRole("heading", { name: roundLabel })).toBeVisible();
  // The submission form's own flow (task 009) is covered end-to-end in the
  // submission test below — this test only cares that the food item made it
  // into the picker, not that a select's <option> is "visible".
  await expect(page.getByLabel("Food item", { exact: false })).toContainText("Pho Bo");
  await expect(page.getByText("This round is closed.")).not.toBeVisible();

  await page.goto(`/admin/rounds/${roundId}`);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Round closed")).toBeVisible();

  await page.goto(`/r/${roundId}`);
  await expect(page.getByRole("heading", { name: roundLabel })).toBeVisible();
  await expect(page.getByText("This round is closed.")).toBeVisible();
});

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

  // Admin can see the submission (resolved names, not raw ids) and export it.
  await page.goto(`/admin/rounds/${roundId}`);
  await expect(page.getByRole("cell", { name: employeeName })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Less ice" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`round-${roundId}-submissions.csv`);

  // Only one round can be open at a time app-wide — leaving this one open
  // would block every other spec's own "Open" step for the rest of the run.
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Round closed")).toBeVisible();
});
