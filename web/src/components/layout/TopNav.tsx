"use client";

/**
 * TopNav (docs/design-system.md §2, §6): the ONLY navigation. Horizontal top bar, sticky, 64 px.
 * Logo + 7 links + the Scenario button + active-scenario chips. Below 1024 px the links move into a
 * drop-down sheet from the top. There is no sidebar anywhere.
 */
import { Menu, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { activeChips, encodeScenario } from "@/lib/state/scenario";
import { useScenario, useScenarioStore } from "@/lib/state/scenarioStore";

import { isActive, NAV_ITEMS, withQuery } from "./nav";

const MAX_CHIPS = 3;

export function TopNav() {
  const pathname = usePathname();
  const scenario = useScenario();
  const consoleOpen = useScenarioStore((s) => s.consoleOpen);
  const setConsoleOpen = useScenarioStore((s) => s.setConsoleOpen);
  const [sheetOpen, setSheetOpen] = useState(false);
  const query = encodeScenario(scenario);
  const chips = activeChips(scenario);

  const links = (onNavigate?: () => void) =>
    NAV_ITEMS.map((item) => {
      const active = isActive(pathname, item.href);
      return (
        <li key={item.href}>
          <Link href={withQuery(item.href, query)} className="nav-link" aria-current={active ? "page" : undefined}
            onClick={onNavigate}>
            {item.label}
          </Link>
        </li>
      );
    });

  return (
    <header className="top-bar" data-testid="top-bar">
      <div className="top-bar-inner">
        <Link href={withQuery("/", query)} className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">
            <span className="text-ink font-semibold">Fresh Control Tower</span>
            <span className="text-ink-muted text-xs">Fictional UAE operator</span>
          </span>
          <span className="sr-only"> (Overview)</span>
        </Link>

        <nav aria-label="Main" className="nav-desktop">
          <ul>{links()}</ul>
        </nav>

        <div className="top-bar-actions">
          <ul className="chips" aria-label="Active scenario">
            {chips.slice(0, MAX_CHIPS).map((c) => <li key={c} className="scenario-chip">{c}</li>)}
            {chips.length > MAX_CHIPS ? <li className="scenario-chip">+{chips.length - MAX_CHIPS}</li> : null}
          </ul>
          <button type="button" className="scenario-button" aria-expanded={consoleOpen} aria-controls="scenario-console"
            onClick={() => setConsoleOpen(!consoleOpen)} data-testid="scenario-button">
            <SlidersHorizontal aria-hidden="true" size={16} />
            {/* Visually hidden on narrow phones so the bar fits 375 px; still read by screen readers. */}
            <span className="max-sm:sr-only">Scenario</span>
            {chips.length ? <span className="scenario-count" aria-label={`${chips.length} active`}>{chips.length}</span> : null}
          </button>
          <button type="button" className="menu-button" aria-expanded={sheetOpen} aria-controls="mobile-nav"
            aria-label={sheetOpen ? "Close menu" : "Open menu"} onClick={() => setSheetOpen(!sheetOpen)}>
            {sheetOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
          </button>
        </div>
      </div>

      {sheetOpen ? (
        <nav id="mobile-nav" aria-label="Main (mobile)" className="nav-sheet">
          <ul>{links(() => setSheetOpen(false))}</ul>
        </nav>
      ) : null}
    </header>
  );
}
