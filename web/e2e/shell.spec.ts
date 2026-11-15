import { expect, type Page, test } from "@playwright/test";
import { watchConsole } from "./helpers";

/**
 * Part 5 (web foundation) end-to-end checks against the static export:
 * top navigation only (no sidebar), the mobile top sheet with no horizontal scroll at 375 px, the Scenario
 * Console persisted in the URL, the placeholder banner, and an error panel (not a console error) when an
 * artefact fails its contract. Every test fails on any console error.
 */


async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("desktop (1440 px)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("horizontal top navigation with seven pages and no sidebar", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main", exact: true });
    await expect(nav.getByRole("link")).toHaveCount(7);
    await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator("aside, [role=complementary]")).toHaveCount(0);
    const bar = await page.getByTestId("top-bar").boundingBox();
    expect(bar?.height).toBe(64);
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test("the Scenario Console sets presets, persists them in the URL and in links", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/");
    await page.getByTestId("scenario-button").click();
    const panel = page.getByTestId("scenario-console");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Hormuz 2026" }).click();
    await expect(page).toHaveURL(/dis=hormuz2026/);
    await expect(page).toHaveURL(/win=hormuz/);
    await expect(page.getByRole("list", { name: "Active scenario" })).toContainText("Hormuz disruption");
    const demandHref = await page.getByRole("navigation", { name: "Main", exact: true })
      .getByRole("link", { name: "Demand Lab" }).getAttribute("href");
    expect(demandHref).toContain("dis=hormuz2026");

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(page.getByTestId("scenario-button")).toBeFocused();

    await page.reload();
    await page.getByTestId("scenario-button").click();
    await expect(page.getByTestId("scenario-console").getByRole("button", { name: "Hormuz 2026" }))
      .toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page).not.toHaveURL(/dis=/);
    expect(errors).toEqual([]);
  });

  test("a shared link restores its scenario", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/?dm=1.5&pol=P1&sp=1&spm=3");
    await expect(page.getByRole("list", { name: "Active scenario" })).toContainText("Demand 1.5×");
    await page.getByTestId("scenario-button").click();
    await expect(page.getByLabel("Ordering method", { exact: true })).toHaveValue("P1");
    expect(errors).toEqual([]);
  });

  test("the placeholder banner appears when any artefact is a fixture", async ({ page }) => {
    await page.route("**/data/meta.json", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, isFixture: true } });
    });
    await page.goto("/");
    await expect(page.getByTestId("placeholder-banner")).toContainText("PLACEHOLDER DATA");
  });

  test("real data shows no banner", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("placeholder-banner")).toHaveCount(0);
  });

  test("a contract failure becomes an error state, not a console error", async ({ page }) => {
    const errors = watchConsole(page);
    await page.route("**/data/catalog.json", (route) => route.fulfill({ status: 200, json: { not: "a catalog" } }));
    await page.goto("/");
    await page.getByTestId("scenario-button").click();
    await expect(page.getByTestId("scenario-console")).toContainText("Store and SKU list unavailable.");
    expect(errors).toEqual([]);
  });
});

test.describe("mobile (375 px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("links move into a top sheet and nothing scrolls sideways", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    const sheet = page.getByRole("navigation", { name: "Main (mobile)" });
    await expect(sheet.getByRole("link")).toHaveCount(7);
    await noHorizontalScroll(page);
    await page.getByRole("button", { name: "Close menu" }).click();
    await page.getByTestId("scenario-button").click();
    await expect(page.getByTestId("scenario-console")).toBeVisible();
    await noHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
});
