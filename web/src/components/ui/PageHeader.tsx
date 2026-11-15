/**
 * PageHeader (CR-003): the hero of every page. An eyebrow with a live dot, a large gradient title, a lede and
 * an optional slot (tabs, chips). The staggered rise-in is CSS (globals.css, .page-header), so it runs
 * from the pre-rendered HTML without waiting for JavaScript and stops under prefers-reduced-motion.
 */
import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: ReactNode;
  /** Rendered under the lede, for example a tab list. */
  children?: ReactNode;
  /** Right-hand slot on wide screens, for example status chips. */
  aside?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, children, aside }: PageHeaderProps) {
  return (
    <header className="col-span-12 page-header">
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
