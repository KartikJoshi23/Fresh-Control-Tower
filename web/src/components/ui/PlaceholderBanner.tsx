"use client";

/**
 * PlaceholderBanner (docs/design-system.md §6, data contracts rule 4): shown whenever ANY loaded artefact
 * has isFixture: true, so placeholder numbers can never be presented as results.
 */
import { TriangleAlert } from "lucide-react";

import { useFixturePaths } from "@/lib/data/hooks";

export function PlaceholderBanner() {
  const paths = useFixturePaths();
  if (paths.length === 0) return null;
  return (
    <div role="alert" className="placeholder-banner" data-testid="placeholder-banner">
      <TriangleAlert aria-hidden="true" size={16} />
      <strong>PLACEHOLDER DATA: not results.</strong>
      <span className="text-ink-secondary">Fixture files loaded: {paths.join(", ")}</span>
    </div>
  );
}
