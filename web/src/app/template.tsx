/**
 * Route transition (CR-003). A template re-mounts on every navigation, so each page rises into place.
 *
 * Deliberately CSS (globals.css, .route-enter), not Framer Motion: the static export pre-renders this HTML,
 * and a motion wrapper would ship `opacity: 0` in it. CSS keyframes run without waiting for JavaScript,
 * leave no transform behind (fill-mode: backwards) and switch off under prefers-reduced-motion.
 */
import type { ReactNode } from "react";

export default function Template({ children }: { children: ReactNode }) {
  return <div className="route-enter">{children}</div>;
}
