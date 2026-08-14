import { expect, test } from "@playwright/test";

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
  // The submission form's own flow (task 009) is covered end-to-end in
  // public-round-submission.spec.ts — this test only cares that the food
  // item made it into the picker, not that a select's <option> is "visible".
  await expect(page.getByLabel("Food item", { exact: false })).toContainText("Pho Bo");
  await expect(page.getByText("This round is closed.")).not.toBeVisible();

  await page.goto(`/admin/rounds/${roundId}`);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Round closed")).toBeVisible();

  await page.goto(`/r/${roundId}`);
  await expect(page.getByRole("heading", { name: roundLabel })).toBeVisible();
  await expect(page.getByText("This round is closed.")).toBeVisible();
});

test("an unknown round's public link shows the generic not-open-yet message", async ({ page }) => {
  // The draft-round case of this same generic message is already covered at
  // the API level (byte-for-byte body equality) and in Round.test.tsx — this
  // e2e check only needs to confirm the nonexistent-round path renders it.
  await page.goto("/r/999999999");
  await expect(page.getByText("This round isn't open yet.")).toBeVisible();
});
