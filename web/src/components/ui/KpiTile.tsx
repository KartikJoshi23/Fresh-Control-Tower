"use client";

/**
 * KPI tile (docs/design-system.md §6; CR-003): a hero number that counts up, its delta against the baseline
 * as an icon + text pill (never colour alone), the Monte Carlo range and a provenance chip.
 * The tile lifts on hover with a spring curve (CSS) and its glass rim follows the cursor (Spotlight).
 */
import { Check, TriangleAlert } from "lucide-react";

import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import type { Provenance } from "@/lib/contracts";

interface KpiTileProps {
  label: string;
  value: string;
  /** Omit for a status count with no baseline to compare against. */
  delta?: string;
  better?: boolean;
  range?: string;
  provenance: Provenance;
}

export function KpiTile({ label, value, delta, better, range, provenance }: KpiTileProps) {
  return (
    <div className="kpi-tile glass-panel glass-chart" data-testid="kpi-tile">
      <span className="kpi-sheen" aria-hidden="true" />
      <div className="flex items-start justify-between gap-2">
        <span className="stat-label">{label}</span>
        <ProvenanceChip provenance={provenance} />
      </div>
      <AnimatedNumber className="kpi-value" text={value} />
      {delta ? (
        <span className="kpi-delta" data-tone={better ? "good" : "warning"}>
          {better ? <Check aria-hidden="true" size={13} strokeWidth={2.6} /> : <TriangleAlert aria-hidden="true" size={13} strokeWidth={2.4} />}
          <span className="text-ink">{delta}</span>
        </span>
      ) : null}
      {range ? <span className="kpi-range tabular-nums">{range}</span> : null}
    </div>
  );
}
