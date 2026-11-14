/** The seven pages (implementation-plan.md §6.1), in top-bar order. */
export const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/demand/", label: "Demand Lab" },
  { href: "/scenarios/", label: "Scenario Studio" },
  { href: "/live/", label: "Live Ops" },
  { href: "/sourcing/", label: "Sourcing" },
  { href: "/impact/", label: "Impact" },
  { href: "/roadmap/", label: "Roadmap" },
] as const;

/** True when `pathname` is the page `href` (trailing slashes ignored; "/" matches only itself). */
export function isActive(pathname: string, href: string): boolean {
  const clean = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
  const path = clean(pathname || "/");
  const target = clean(href);
  return target === "/" ? path === "/" : path === target || path.startsWith(`${target}/`);
}

/** The link target with the current scenario query appended (so a scenario survives navigation). */
export function withQuery(href: string, query: string): string {
  return query ? `${href}?${query}` : href;
}
