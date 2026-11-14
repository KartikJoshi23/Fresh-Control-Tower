/**
 * Chart theme (docs/design-system.md §4, implementation-plan.md §6.5).
 * Colour follows the ENTITY, never its rank: AI = slot 1, baseline/recorded = slot 2, true demand = slot 3.
 * Other series take slots 4+ in order. Text uses ink tokens, never series colours. No dual axes.
 */
export const ENTITY_COLOR = {
  ai: "var(--series-1)",
  baseline: "var(--series-2)",
  truth: "var(--series-3)",
} as const;

export const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
] as const;

/** Slot colour for the n-th "other" series (slots 4-8); a 9th series is folded into "Other", never a new hue. */
export function otherSeriesColor(index: number): string {
  if (index < 0 || index > 4) throw new Error("At most 5 extra series: fold the rest into 'Other'");
  return SERIES[3 + index];
}

export const CHART = {
  grid: "var(--gridline)",
  axis: "var(--axis)",
  ink: "var(--ink-secondary)",
  inkMuted: "var(--ink-muted)",
  lineWidth: 2,
  barRadius: 4,
  font: "var(--font-sans)",
  fontSize: 12,
} as const;
