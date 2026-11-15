import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/**
 * P9-03 QA sweep: every route at 375, 768 and 1440 px renders its main content, has no horizontal scroll and
 * logs no console errors; axe reports no serious or critical violations (WCAG 2.1 A and AA rules).
 * Lighthouse budgets are run by hand (see web/README.md): Lighthouse is not a project dependency.
 */
const ROUTES = [
  { path: "/", heading: "Fresh Control Tower", ready: "recommendation" },
  { path: "/demand/", heading: "Demand Lab", ready: "bias-readout" },
  { path: "/scenarios/", heading: "Scenario Studio", ready: "option-table" },
  { path: "/live/", heading: "Live Ops", ready: "shelf-grid" },
  { path: "/sourcing/", heading: "Sourcing", ready: "rank-race" },
  { path: "/impact/", heading: "Impact", ready: "frontier" },
  { path: "/roadmap/", heading: "Roadmap", ready: "risk-register" },
] as const;
const WIDTHS = [375, 768, 1440] as const;

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

for (const width of WIDTHS) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const route of ROUTES) {
      test(`${route.path} renders without overflow or console errors`, async ({ page }) => {
        const errors = watchConsole(page);
        await page.goto(route.path);
        await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
        await expect(page.getByTestId(route.ready).first()).toBeVisible();
        await page.waitForTimeout(300);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, "horizontal scroll").toBeLessThanOrEqual(0);
        expect(errors).toEqual([]);
      });
    }
  });
}

test.describe("accessibility (axe, 1440 px)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  for (const route of ROUTES) {
    test(`${route.path} has no serious or critical axe violations`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByTestId(route.ready).first()).toBeVisible();
      // The WebGL canvas is decorative (aria-hidden) and has its own text alternative; skip it.
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("canvas").analyze();
      const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }
});
