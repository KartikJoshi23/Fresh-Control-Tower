/**
 * Tooltip content for crosshair (lines, areas) and per-mark (bars, cells) tooltips (plan §6.5).
 * Library-agnostic: Recharts pages pass it as `content` with a small adapter; custom SVG charts render it.
 * Values use ink colours; each row carries the series' swatch so colour is never the only cue.
 */
export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

export function ChartTooltip({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="chart-tooltip" role="tooltip">
      <p className="text-ink text-sm font-medium">{title}</p>
      <ul>
        {rows.map((r) => (
          <li key={r.label}>
            {r.color ? <span className="legend-swatch legend-solid" style={{ color: r.color }} aria-hidden="true" /> : null}
            <span className="text-ink-secondary">{r.label}</span>
            <span className="text-ink tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
