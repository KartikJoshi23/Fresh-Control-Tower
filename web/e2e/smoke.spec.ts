import { expect, test } from "@playwright/test";

/**
 * Smoke test for the Phase 4 scaffold. Part 9 extends this to every route, all viewports
 * (375 / 768 / 1440 px) and accessibility checks.
 */
test("home page renders with no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");

  await expect(page).toHaveTitle(/Fresh Control Tower/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fresh Control Tower");
  expect(errors).toEqual([]);
});
