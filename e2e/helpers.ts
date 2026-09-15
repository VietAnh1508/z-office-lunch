import type { Page } from "@playwright/test";

/**
 * Pre-unlocks the admin password gate (`AdminLayout`) before navigating, for
 * specs that exercise admin functionality rather than the gate itself. Must
 * be called before `page.goto(...)` so sessionStorage is set before the app
 * boots.
 */
export async function unlockAdmin(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("admin-unlocked", "true");
  });
}
