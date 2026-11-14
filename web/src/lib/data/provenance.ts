/**
 * Provenance labels and glyphs (docs/design-system.md §4 and §6: monochrome chips, icon + text).
 */
import type { Provenance } from "@/lib/contracts";

export const PROVENANCE: Record<Provenance, { label: string; glyph: string; meaning: string }> = {
  REAL: { label: "Real", glyph: "●", meaning: "Measured in a real dataset or an official source." },
  CALIBRATED_SYNTHETIC: {
    label: "Synthetic",
    glyph: "◆",
    meaning: "Calibrated synthetic data for a fictional operator, built from the real datasets.",
  },
  SCENARIO: { label: "Scenario", glyph: "▲", meaning: "A what-if computed from the scenario you set." },
  SIMULATED_FEED: { label: "Simulated", glyph: "⟳", meaning: "A replayed hourly feed, not live data." },
  DERIVED: { label: "Derived", glyph: "∑", meaning: "Real factors applied to synthetic volumes." },
  PRECOMPUTED: { label: "Precomputed", glyph: "⧗", meaning: "Computed offline by the Python pipeline (models, backtests)." },
};
