/**
 * Provenance labels and glyphs (docs/design-system.md §4 and §6: monochrome chips, icon + text).
 */
import type { Provenance } from "@/lib/contracts";

export const PROVENANCE: Record<Provenance, { label: string; glyph: string; meaning: string }> = {
  REAL: { label: "Real", glyph: "●", meaning: "Measured in real data, or taken from an official source." },
  CALIBRATED_SYNTHETIC: {
    label: "Synthetic",
    glyph: "◆",
    meaning: "Realistic simulated data for a fictional retailer, shaped by real datasets.",
  },
  SCENARIO: { label: "Scenario", glyph: "▲", meaning: "Calculated in your browser from the scenario you set." },
  SIMULATED_FEED: { label: "Simulated", glyph: "⟳", meaning: "A replay of a simulated hourly feed, not live data." },
  DERIVED: { label: "Derived", glyph: "∑", meaning: "Real-world factors (for example emissions per kilogram) applied to simulated quantities." },
  PRECOMPUTED: { label: "Precomputed", glyph: "⧗", meaning: "Calculated in advance by our forecasting and simulation models." },
};
