import { defineConfig, devices } from "@playwright/test";

/**
 * The same e2e suite (incl. the QA sweep and axe), run against the deployed site instead of web/out:
 *   npx playwright test -c playwright.live.config.ts
 *   LIVE_URL=https://<preview>.vercel.app npx playwright test -c playwright.live.config.ts
 * One retry absorbs network jitter on a cold CDN (a page can take ~3 s to fetch its data the first time).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 4,
  retries: 1,
  reporter: "list",
  use: { baseURL: process.env.LIVE_URL ?? "https://fresh-control-tower.vercel.app", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
