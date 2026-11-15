import { expect, test } from "@playwright/test";
import { watchConsole } from "./helpers";

/** Page-level checks (Parts 6–9): each page renders its data with provenance, and logs no console errors. */

test.use({ viewport: { width: 1440, height: 900 } });

test("Overview leads with a recommendation, five KPI tiles and the Hidden Demand Reveal", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/?win=ramadan-2026");
  await expect(page.getByTestId("recommendation")).toContainText("Switch store ordering to");
  await expect(page.getByTestId("recommendation")).not.toContainText(/\bP[0-3]\b/);
  await expect(page.getByTestId("kpi-tile")).toHaveCount(5);
  const reveal = page.getByTestId("hidden-demand-reveal").first();
  const before = await reveal.textContent();
  await reveal.getByRole("slider").fill("0.1");
  await expect(reveal).not.toHaveText(before ?? "");
  for (const frame of await page.getByTestId("chart-frame").all()) await expect(frame.locator("[data-provenance]").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("Demand Lab: two demand charts with filters, plain accuracy readout, and the data test", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/demand/?win=normal");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: /Real data/ })).toHaveCount(0);
  const readout = page.getByTestId("bias-readout");
  await expect(readout).toContainText("The AI forecast was");
  await expect(readout).toContainText("The current method's forecast was too low");
  // Filter: the first click shows only that line, "Show all" brings the rest back.
  const forecast = page.getByTestId("chart-frame").filter({ hasText: "How close each forecast came" });
  await forecast.getByRole("button", { name: "AI forecast", exact: true }).click();
  await expect(forecast.getByRole("button", { name: "AI forecast", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(forecast.locator("[data-hidden]")).toHaveCount(2);
  await forecast.getByRole("button", { name: "Show all" }).click();
  await expect(forecast.locator("[data-hidden]")).toHaveCount(0);
  await page.getByRole("tab", { name: "Which data matters" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("No stock status");
  await page.getByRole("tabpanel").getByRole("button", { name: /as a table/ }).click();
  await expect(page.getByRole("tabpanel").getByRole("table")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Scenario Studio recomputes in the browser and the Surge Planner responds to the spike", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/scenarios/?sp=1&spd=2026-02-21&spm=2.5&spl=3&spw=7");
  await expect(page.getByTestId("option-table")).toContainText("Current method");
  await expect(page.getByTestId("recompute-time")).toContainText("ms");
  await expect(page.getByTestId("surge-planner")).toBeVisible();
  const flow = page.getByTestId("chart-frame").filter({ hasText: "Stock coming in and going out" });
  await flow.getByRole("button", { name: /as a table/ }).click();
  const before = await flow.getByRole("table").textContent();
  await page.getByLabel(/^Day of the order/).fill("4");
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
  await page.getByRole("radio", { name: "Hours until empty" }).click();
  await expect(page.getByTestId("shelf-grid")).toContainText("h");
  await page.getByLabel("Approval setting").selectOption("manual");
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
  await page.getByRole("radio", { name: "Data-driven" }).click();
  await expect(page).toHaveURL(/w=entropy/);
  expect(await order()).not.toEqual(ahpOrder);
  await page.getByRole("radio", { name: "Hormuz 2026 disruption" }).click();
  await expect(page).toHaveURL(/dis=hormuz2026/);
  await page.getByRole("radio", { name: "Flat map" }).click();
  await expect(page.getByTestId("route-map-flat")).toBeVisible();
  await expect(page.getByTestId("route-globe")).toContainText("routes are disrupted");
  await expect(page.getByTestId("sensitivity-strip")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Roadmap opens on Methods & Data; the Roadmap tab starts with the risk register", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/roadmap/");
  const tabs = page.getByRole("tab");
  await expect(tabs.first()).toHaveText("Methods & Data");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("sources")).toBeVisible();
  await page.getByRole("tab", { name: "Roadmap" }).click();
  const panel = page.getByRole("tabpanel");
  await expect(panel.getByRole("heading", { level: 2 }).first()).toHaveText("Risk register");
  await expect(page.getByTestId("risk-register").locator("tbody tr")).toHaveCount(8);
  expect(errors).toEqual([]);
});

test("headlines carry no internal labels and no policy codes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).not.toContainText(/fictional UAE dark-store operator/i);
  await page.goto("/scenarios/");
  await expect(page.locator("main")).not.toContainText(/runs in your browser/i);
  await expect(page.getByTestId("option-table")).toBeVisible();
  for (const path of ["/", "/scenarios/", "/live/", "/impact/"]) {
    await page.goto(path);
    await page.waitForTimeout(400);
    await expect(page.locator("main")).not.toContainText(/\bP[0-3]\b|P10|P50|P90|τ/);
  }
});
