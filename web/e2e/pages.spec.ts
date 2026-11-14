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

test("Scenario Studio recomputes in the browser and the Surge Planner responds to the spike", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/scenarios/?sp=1&spd=2026-02-21&spm=2.5&spl=3&spw=7");
  await expect(page.getByTestId("option-table")).toContainText("Legacy rule (P0)");
  await expect(page.getByTestId("recompute-time")).toContainText("ms");
  await expect(page.getByTestId("surge-planner")).toBeVisible();
  const flow = page.getByTestId("chart-frame").filter({ hasText: "Stock in and stock out" });
  await flow.getByRole("button", { name: /as a table/ }).click();
  const before = await flow.getByRole("table").textContent();
  await page.getByLabel("Order on day").fill("4");
  await page.getByLabel("Quantity (units)").fill("300");
  await expect(flow.getByRole("table")).not.toHaveText(before ?? "");
  await expect(page).toHaveURL(/moq=300/);
  expect(errors).toEqual([]);
});

test("Live Ops replays the simulated feed with alerts and human approvals", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/live/");
  await expect(page.getByTestId("shelf-grid").getByRole("button")).toHaveCount(20);
  const clock = page.getByTestId("sim-time");
  const start = await clock.textContent();
  await page.getByRole("slider", { name: "Simulated time" }).fill("150");
  await expect(clock).not.toHaveText(start ?? "");
  await expect(page.getByTestId("alert-list").locator("li").first()).toBeVisible();
  await page.getByRole("radio", { name: "Hours of cover" }).click();
  await expect(page.getByTestId("shelf-grid")).toContainText("h");
  await page.getByLabel("Approval mode").selectOption("all");
  const approve = page.getByTestId("po-log").getByRole("button", { name: /^Approve order/ });
  const before = await approve.count();
  expect(before).toBeGreaterThan(0);
  await approve.first().click();
  await expect(approve).toHaveCount(before - 1);
  await page.getByTestId("play-button").click();
  await expect(clock).not.toHaveText(await clock.textContent() ?? "", { timeout: 5000 });
  await page.getByTestId("play-button").click();
  expect(errors).toEqual([]);
});

test("Sourcing re-ranks suppliers by weights and conditions, with a route map", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/sourcing/?sku=strawberries-250g");
  await expect(page.getByTestId("rank-race").getByRole("listitem")).toHaveCount(9);
  await expect(page.getByTestId("sourcing-recommendation")).toContainText("Strawberries");
  const race = await page.getByTestId("rank-race").getAttribute("aria-label");
  expect(race).toBeTruthy();
  const order = async () => (await page.getByTestId("rank-race").getByRole("listitem").evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label")).sort().join("|")));
  const ahpOrder = await order();
  await page.getByRole("radio", { name: "Data-driven (entropy)" }).click();
  await expect(page).toHaveURL(/w=entropy/);
  expect(await order()).not.toEqual(ahpOrder);
  await page.getByRole("radio", { name: "Hormuz 2026" }).click();
  await expect(page).toHaveURL(/dis=hormuz2026/);
  await page.getByRole("radio", { name: "Flat map" }).click();
  await expect(page.getByTestId("route-map-flat")).toBeVisible();
  await expect(page.getByTestId("route-globe")).toContainText("routes are disrupted");
  await expect(page.getByTestId("sensitivity-strip")).toBeVisible();
  expect(errors).toEqual([]);
});
