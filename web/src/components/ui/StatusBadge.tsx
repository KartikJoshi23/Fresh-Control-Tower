/**
 * StatusBadge (docs/design-system.md §4.3): status colour ALWAYS with an icon and a label, never colour alone.
 */
import { Check, Hourglass, TriangleAlert, X } from "lucide-react";

export type StatusKind = "good" | "warning" | "serious" | "critical";

const STATUS = {
  good: { label: "In stock", Icon: Check },
  warning: { label: "At risk", Icon: TriangleAlert },
  serious: { label: "Expiring", Icon: Hourglass },
  critical: { label: "Stockout", Icon: X },
} as const;

/** Maps the live-feed shelf status (contract live.ts) to the status token. */
export const SHELF_STATUS: Record<"in_stock" | "at_risk" | "expiring" | "stockout", StatusKind> = {
  in_stock: "good",
  at_risk: "warning",
  expiring: "serious",
  stockout: "critical",
};

export function StatusBadge({ status, label }: { status: StatusKind; label?: string }) {
  const { label: fallback, Icon } = STATUS[status];
  return (
    <span className="status-badge" data-status={status} style={{ color: `var(--status-${status})` }}>
      <Icon aria-hidden="true" size={14} strokeWidth={2.5} />
      <span className="text-ink">{label ?? fallback}</span>
    </span>
  );
}
