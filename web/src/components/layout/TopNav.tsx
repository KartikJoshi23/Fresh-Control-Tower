"use client";

/**
 * TopNav (docs/design-system.md §2, §6; CR-003): the ONLY navigation. A horizontal, sticky, 64 px glass bar.
 * - Brand: an animated gradient mark and the wordmark.
 * - Seven links in a floating pill group; the active pill springs between links (Glide.tsx).
 * - Active-scenario chips and the Scenario button on the right.
 * Below 1024 px the links move into a drop-down sheet from the top. There is no sidebar anywhere.
 */
import { Menu, Radar, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { GlideIndicator, useGlide } from "@/components/motion/Glide";
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
  const [pillsRef, pill] = useGlide<HTMLDivElement>('.nav-link[aria-current="page"]', [pathname]);
  const query = encodeScenario(scenario);
  const chips = activeChips(scenario);

  const links = (onNavigate?: () => void) =>
    NAV_ITEMS.map((item) => {
      const active = isActive(pathname, item.href);
      return (
        <li key={item.href}>
          <Link href={withQuery(item.href, query)} className="nav-link" aria-current={active ? "page" : undefined}
            onClick={onNavigate}>
            <span className="nav-label">{item.label}</span>
          </Link>
        </li>
      );
    });

  return (
    <header className="top-bar" data-testid="top-bar">
      <div className="top-bar-inner">
        <Link href={withQuery("/", query)} className="brand">
          <span className="brand-mark" aria-hidden="true"><Radar size={15} strokeWidth={2.4} /></span>
          <span className="brand-text">
            <span className="brand-name">Fresh Control Tower</span>
            <span className="brand-sub">Fictional UAE operator</span>
          </span>
          <span className="sr-only"> (Overview)</span>
        </Link>

        <nav aria-label="Main" className="nav-desktop">
          <div ref={pillsRef} className="nav-pills" data-glide={pill ? "" : undefined}>
            <GlideIndicator box={pill} className="nav-active" />
            <ul className="nav-list">{links()}</ul>
          </div>
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
