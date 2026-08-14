import { expect, test } from "@playwright/test";

// The open/close round-lifecycle case that used to live here moved to
// round-lifecycle.spec.ts, alongside the other specs that each open a round
// — see that file's header comment for why. This test doesn't open a round,
// so it carries no collision risk and stays on its own.
test("an unknown round's public link shows the generic not-open-yet message", async ({ page }) => {
  // The draft-round case of this same generic message is already covered at
  // the API level (byte-for-byte body equality) and in Round.test.tsx — this
  // e2e check only needs to confirm the nonexistent-round path renders it.
  await page.goto("/r/999999999");
  await expect(page.getByText("This round isn't open yet.")).toBeVisible();
});
