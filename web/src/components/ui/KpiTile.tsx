/**
 * KPI tile (docs/design-system.md §6): a hero number, its delta against the baseline as an icon + text
 * (never colour alone), the Monte Carlo range and a provenance chip.
 */
import { Check, TriangleAlert } from "lucide-react";

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
      <div className="flex items-start justify-between gap-2">
        <span className="stat-label">{label}</span>
        <ProvenanceChip provenance={provenance} />
      </div>
      <span className="kpi-value">{value}</span>
      {delta ? (
        <span className="kpi-delta" style={{ color: `var(--status-${better ? "good" : "warning"})` }}>
          {better ? <Check aria-hidden="true" size={14} /> : <TriangleAlert aria-hidden="true" size={14} />}
          <span className="text-ink-secondary">{delta}</span>
        </span>
      ) : null}
      {range ? <span className="text-ink-muted text-xs tabular-nums">{range}</span> : null}
    </div>
  );
}
