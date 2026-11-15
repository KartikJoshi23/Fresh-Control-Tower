/**
 * PageHeader (CR-003): the hero of every page. An eyebrow with a live dot, a large title, a lede and an
 * optional slot (tabs, chips). The staggered rise-in is CSS (globals.css, .page-header), so it runs from the
 * pre-rendered HTML without waiting for JavaScript and stops under prefers-reduced-motion.
 *
 * `accent` is the page's identity colour. CSS reads `data-accent` and sets --page-accent for the whole
 * document (eyebrow dot, top glow, active-nav underline, selection rims). It is decorative, never data.
 */
import type { ReactNode } from "react";

export type PageAccent = "violet" | "cyan" | "pink" | "lime" | "sky" | "emerald" | "fuchsia";

interface PageHeaderProps {
  accent: PageAccent;
  eyebrow: string;
  title: string;
  description: ReactNode;
  /** Rendered under the lede, for example a tab list. */
  children?: ReactNode;
  /** Right-hand slot on wide screens, for example status chips. */
  aside?: ReactNode;
}

export function PageHeader({ accent, eyebrow, title, description, children, aside }: PageHeaderProps) {
  return (
    <header className="col-span-12 page-header" data-accent={accent}>
      <div className="page-header-main">
        <p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" />{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        <p className="page-lede">{description}</p>
        {children}
      </div>
      {aside ? <div className="page-header-aside">{aside}</div> : null}
    </header>
  );
}
