import { expect, test } from "@playwright/test";

test("Add restaurant form validates the Name field without native HTML5 validation", async ({
  page,
}) => {
  const postRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/restaurants")) {
      postRequests.push(request.url());
    }
  });

  await page.goto("/admin");

  const nameInput = page.getByPlaceholder("Name");
  await expect(nameInput).not.toHaveAttribute("required");
  expect(await nameInput.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(true);

  await page.getByRole("button", { name: "Add restaurant" }).click();

  await expect(page.getByText("Name is required.")).toBeVisible();
  await expect(nameInput).toHaveAttribute("aria-invalid", "true");
  expect(postRequests).toHaveLength(0);

  await nameInput.fill("Sushi Spot");

  await expect(page.getByText("Name is required.")).not.toBeVisible();
  await expect(nameInput).toHaveAttribute("aria-invalid", "false");
});
