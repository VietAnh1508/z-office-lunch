import { expect, test } from "@playwright/test";
import { unlockAdmin } from "./helpers";

test("admin can create a size preset and see its options", async ({ page }) => {
  await unlockAdmin(page);
  await page.goto("/admin/sizes");

  const presetName = `Cup sizes ${Date.now()}`;
  await page.getByLabel("Preset name", { exact: false }).fill(presetName);
  await page.getByLabel("Options", { exact: false }).fill("S\nM\nL");
  await page.getByRole("button", { name: "Add preset" }).click();

  await expect(page.getByText("Size preset added")).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: presetName });
  await expect(row.getByText("S / M / L")).toBeVisible();
});
