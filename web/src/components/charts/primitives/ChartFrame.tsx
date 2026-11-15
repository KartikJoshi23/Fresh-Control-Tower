"use client";

/**
 * ChartFrame (docs/design-system.md §6): every chart sits in one. It holds:
 * - a title that says what the chart answers, and an optional subtitle;
 * - provenance chip(s);
 * - a legend whenever there are 2+ series (direct labels are the chart's job when there are ≤ 4);
 * - a table-view toggle. The global Scenario Console "table view" switch turns every chart into its table.
 * It lives in a "chart" GlassPanel, the only surface validated behind data (CR-003 glass).
 */
import { ChartLine, Table2 } from "lucide-react";
import { inView } from "motion";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import type { Provenance } from "@/lib/contracts";
import { useScenario } from "@/lib/state/scenarioStore";

export interface LegendItem {
  label: string;
  color: string;
  /** Line style, so meaning is not carried by colour alone. */
  style?: "solid" | "dashed" | "band" | "bar";
}

interface ChartFrameProps {
  title: string;
  subtitle?: string;
  provenance: Provenance | Provenance[];
  sources?: string[];
  legend?: LegendItem[];
  /** The chart itself. */
  children: ReactNode;
  /** The same data as a table (required: every chart has a table view). */
  table: ReactNode;
  className?: string;
  /** Extra controls placed in the header (for example a toggle owned by the page). */
  actions?: ReactNode;
}

export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="legend" aria-label="Legend">
      {items.map((item) => (
        <li key={item.label}>
          <span className={`legend-swatch legend-${item.style ?? "solid"}`} style={{ color: item.color }} aria-hidden="true" />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChartFrame({ title, subtitle, provenance, sources, legend = [], children, table, className = "", actions }: ChartFrameProps) {
  const id = useId();
  const globalTable = useScenario().ui.tableView;
  const [localTable, setLocalTable] = useState<boolean | null>(null);
  const showTable = localTable ?? globalTable;
  const chips = Array.isArray(provenance) ? provenance : [provenance];
  // Scroll reveal (CR-003): Motion's inView marks the frame once a sliver of it is on screen; CSS animates it.
  const frame = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!frame.current) return;
    return inView(frame.current, () => {
      setSeen(true);
    }, { amount: 0.08 });
  }, []);
  return (
    <GlassPanel ref={frame} variant="chart" className={`chart-frame ${className}`} aria-labelledby={`${id}-title`}
      data-testid="chart-frame" data-inview={seen ? "" : undefined}>
      <header className="chart-head">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="chart-title">{title}</h3>
          {subtitle ? <p className="chart-subtitle">{subtitle}</p> : null}
        </div>
        <div className="chart-tools">
          {chips.map((p) => <ProvenanceChip key={p} provenance={p} sources={sources} />)}
          {actions}
          <button type="button" className="icon-button" aria-pressed={showTable}
            aria-label={showTable ? `Show ${title} as a chart` : `Show ${title} as a table`}
            onClick={() => setLocalTable(!showTable)}>
            {showTable ? <ChartLine aria-hidden="true" size={16} /> : <Table2 aria-hidden="true" size={16} />}
          </button>
        </div>
      </header>
      {!showTable ? <Legend items={legend} /> : null}
      {/* Keyed so switching between chart and table re-runs the fade-in (globals.css, .chart-body). */}
      <div className="chart-body" key={showTable ? "table" : "chart"}>{showTable ? table : children}</div>
    </GlassPanel>
  );
}
