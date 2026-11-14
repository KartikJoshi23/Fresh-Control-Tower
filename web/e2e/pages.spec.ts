import { expect, type Page, test } from "@playwright/test";

/** Page-level checks (Parts 6–9): each page renders its data with provenance, and logs no console errors. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test.use({ viewport: { width: 1440, height: 900 } });

test("Overview leads with a recommendation, five KPI tiles and the Hidden Demand Reveal", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/?win=ramadan-2026");
  await expect(page.getByTestId("recommendation")).toContainText("Move replenishment to");
  await expect(page.getByTestId("kpi-tile")).toHaveCount(5);
  const reveal = page.getByTestId("hidden-demand-reveal").first();
  const before = await reveal.textContent();
  await reveal.getByRole("slider").fill("0.1");
  await expect(reveal).not.toHaveText(before ?? "");
  for (const frame of await page.getByTestId("chart-frame").all()) await expect(frame.locator("[data-provenance]").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("Demand Lab: series, forecast toggle, real-data tab and ablation", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/demand/?win=normal");
  await expect(page.getByTestId("bias-readout")).toContainText("bias");
  await page.getByRole("switch", { name: "Legacy forecast" }).click();
  await expect(page.getByTestId("bias-readout")).toContainText("under-forecasts");
  await page.getByRole("tab", { name: "Real data (FreshRetailNet)" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Training on recovered demand removes the forecast bias");
  await expect(page.getByRole("tabpanel").locator('[data-provenance="REAL"]').first()).toBeVisible();
  await page.getByRole("tab", { name: "What data matters" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Stock status");
  await page.getByRole("tabpanel").getByRole("button", { name: /as a table/ }).click();
  await expect(page.getByRole("tabpanel").getByRole("table")).toBeVisible();
  expect(errors).toEqual([]);
});
