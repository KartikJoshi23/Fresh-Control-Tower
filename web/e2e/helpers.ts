import type { Page } from "@playwright/test";

/** Collects console errors and uncaught page errors; every e2e test ends by expecting none. */
export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}
