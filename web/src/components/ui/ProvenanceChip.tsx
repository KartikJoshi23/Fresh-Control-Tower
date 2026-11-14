/**
 * ProvenanceChip (docs/design-system.md §6): a monochrome outline chip with a glyph and a label, so it
 * never competes with data colour. The tooltip (title) names the meaning and, when given, the sources.
 * Every chart and figure carries one (plan §1.2, "Honesty").
 */
import type { Provenance } from "@/lib/contracts";
import { PROVENANCE } from "@/lib/data/provenance";

interface ProvenanceChipProps {
  provenance: Provenance;
  /** Source names or ids shown in the tooltip, for example ["Wang et al. (2025)"]. */
  sources?: string[];
  className?: string;
}

export function ProvenanceChip({ provenance, sources = [], className = "" }: ProvenanceChipProps) {
  const p = PROVENANCE[provenance];
  const tip = sources.length ? `${p.meaning} Sources: ${sources.join("; ")}.` : p.meaning;
  return (
    <span className={`provenance-chip ${className}`} title={tip} data-provenance={provenance}>
      <span aria-hidden="true">{p.glyph}</span>
      <span>{p.label}</span>
      <span className="sr-only">: {tip}</span>
    </span>
  );
}
